"""
AWS Lambda handler for the document processing SQS worker.

Triggered by SQS events. Each record contains:
  {
    "document_id": "<uuid>",
    "s3_key": "<s3-key>",
    "metadata": { "filename": "...", "title": "...", "source": "...", "department": "..." }
  }

The handler downloads the file from S3, runs the full processing pipeline
(extract → chunk → embed → upsert to Pinecone), then updates the document
status in PostgreSQL.
"""

import asyncio
import json
import logging
import os
import tempfile
from typing import Any, Dict

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def _get_settings():
    """Lazy import so unit tests can patch env vars before importing config."""
    from config import settings
    return settings


async def _process(document_id: str, s3_key: str, metadata: dict):
    from config import settings
    from models import DocumentMetadata, ProcessingStatus
    from services.database import DatabaseService
    from services.document_processor import DocumentProcessor
    from services.embedding_service import EmbeddingService
    from services.pinecone_service import PineconeService
    from services import s3_service

    # Initialise services (Lambda keeps these alive across warm invocations)
    db = DatabaseService(settings.database_url)
    await db.initialize()

    embedding_svc = EmbeddingService(
        openai_api_key=settings.openai_api_key,
        model_name=settings.embedding_model,
    )
    pinecone_svc = PineconeService(
        api_key=settings.pinecone_api_key,
        environment=settings.pinecone_environment,
        index_name=settings.pinecone_index_name,
    )
    await pinecone_svc.initialize()

    doc_processor = DocumentProcessor(
        max_chunk_size=settings.max_chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )

    try:
        await db.update_document_status(document_id, ProcessingStatus.PROCESSING)

        # Download from S3 to a temp file
        with tempfile.NamedTemporaryFile(
            suffix=os.path.splitext(metadata.get("filename", ".bin"))[1],
            delete=False,
        ) as tmp:
            local_path = tmp.name

        s3_service.download_file(s3_key, local_path)

        # Extract text
        text_content = await doc_processor.extract_text(local_path)

        # Chunk
        chunks = await doc_processor.chunk_text(
            text_content,
            metadata.get("title", "Unknown"),
            metadata.get("source", "upload"),
        )
        logger.info(f"Document {document_id}: {len(chunks)} chunks")

        # Embed and build Pinecone vectors
        vectors = []
        for i, chunk in enumerate(chunks):
            embedding = await embedding_svc.generate_embedding(chunk.content)
            vectors.append({
                "id": f"{document_id}_chunk_{i}",
                "values": embedding,
                "metadata": {
                    "document_id": document_id,
                    "chunk_index": i,
                    "title": metadata.get("title", ""),
                    "source": metadata.get("source", ""),
                    "department": metadata.get("department", "general"),
                    "content": chunk.content,
                    "filename": metadata.get("filename", ""),
                },
            })

        await pinecone_svc.upsert_vectors(vectors)

        await db.update_document_status(
            document_id,
            ProcessingStatus.COMPLETED,
            chunk_count=len(chunks),
        )
        logger.info(f"Document {document_id} processed successfully ({len(chunks)} chunks)")

    except Exception as e:
        logger.error(f"Document {document_id} processing failed: {e}")
        await db.update_document_status(
            document_id,
            ProcessingStatus.FAILED,
            error_message=str(e),
        )
        raise
    finally:
        await db.close()
        try:
            os.unlink(local_path)
        except Exception:
            pass


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda entry point — processes all SQS records in the batch."""
    records = event.get("Records", [])
    logger.info(f"Received {len(records)} SQS record(s)")

    failed_ids = []

    for record in records:
        message_id = record.get("messageId", "unknown")
        try:
            body = json.loads(record["body"])
            document_id = body["document_id"]
            s3_key = body["s3_key"]
            metadata = body.get("metadata", {})

            asyncio.run(_process(document_id, s3_key, metadata))

        except Exception as e:
            logger.error(f"Failed to process SQS record {message_id}: {e}")
            # Return as batchItemFailure so SQS retries only this message
            failed_ids.append({"itemIdentifier": message_id})

    return {"batchItemFailures": failed_ids}
