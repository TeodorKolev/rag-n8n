"""
Python Document Processing Service for RAG Assistant
Handles document ingestion, preprocessing, embedding generation, and Pinecone storage.
"""

import asyncio
import json
import os
import uuid
import logging
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
import uvicorn

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from services.document_processor import DocumentProcessor
from services.embedding_service import EmbeddingService
from services.pinecone_service import PineconeService
from services.database import DatabaseService
from services import cache_service
from config import settings
from models import DocumentMetadata, ProcessingStatus, EmbeddingRequest, QueryRequest
from routers import auth, conversations, admin, documents
from limiter import limiter

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global services
document_processor: DocumentProcessor = None
embedding_service: EmbeddingService = None
pinecone_service: PineconeService = None
database_service: DatabaseService = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup"""
    global document_processor, embedding_service, pinecone_service, database_service

    logger.info("Initializing services...")

    try:
        database_service = DatabaseService(settings.database_url)
        await database_service.initialize()

        embedding_service = EmbeddingService(
            openai_api_key=settings.openai_api_key,
            model_name=settings.embedding_model
        )

        pinecone_service = PineconeService(
            api_key=settings.pinecone_api_key,
            environment=settings.pinecone_environment,
            index_name=settings.pinecone_index_name
        )
        await pinecone_service.initialize()

        document_processor = DocumentProcessor(
            max_chunk_size=settings.max_chunk_size,
            chunk_overlap=settings.chunk_overlap
        )

        logger.info("All services initialized successfully")

    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise

    yield

    logger.info("Shutting down services...")
    if database_service:
        await database_service.close()
    await cache_service.close()


app = FastAPI(
    title="RAG Assistant API",
    description="Backend API for the RAG Assistant — document processing, conversations, auth",
    version="2.0.0",
    lifespan=lifespan,
)

# ── Fix #12: Correlation ID middleware ───────────────────────────────────────
class CorrelationIDMiddleware(BaseHTTPMiddleware):
    """Propagate or generate a request ID so distributed traces can be linked."""
    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.correlation_id = correlation_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = correlation_id
        return response

app.add_middleware(CorrelationIDMiddleware)

# ── Fix #4: Rate limiter ──────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add CORS middleware
_allowed_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-Request-ID"],
)

# Register routers
app.include_router(auth.router, prefix="/api")
app.include_router(conversations.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(documents.router, prefix="/api")


async def require_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    if x_api_key != settings.python_service_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


# ── Fix #11: Real health check ────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Health check — tests actual connectivity, not just object existence."""
    db_ok = False
    if database_service and database_service.pool:
        try:
            await database_service.pool.fetchval("SELECT 1")
            db_ok = True
        except Exception:
            pass

    status = "healthy" if db_ok else "degraded"
    return {
        "status": status,
        "services": {
            "document_processor": document_processor is not None,
            "embedding_service": embedding_service is not None,
            "pinecone_service": pinecone_service is not None,
            "database": db_ok,
        },
    }


# ── Fix #1 + #6: safe filename, file saved before DB record ──────────────────
@app.post("/documents/upload")
@limiter.limit("10/minute")
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = None,
    source: Optional[str] = None,
    department: Optional[str] = None,
    _: None = Depends(require_api_key),
):
    """Upload and process a document"""

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Validate file type
    allowed_extensions = {'.pdf', '.docx', '.txt', '.md'}
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
        )

    try:
        content = await file.read()

        # ── Fix #1: enforce size limit and sanitize filename ─────────────────
        if len(content) > settings.max_file_size:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {settings.max_file_size // (1024 * 1024)} MB",
            )

        # Replace user-supplied filename with a safe UUID-based name to prevent
        # path traversal attacks (e.g. ../../etc/passwd as a filename).
        safe_filename = f"{uuid.uuid4().hex}{file_extension}"

        if settings.s3_bucket and settings.sqs_queue_url:
            # ── Production path: S3 first, then DB record ────────────────────
            from services import s3_service, sqs_service
            s3_key = f"uploads/{safe_filename}"
            await s3_service.upload_file(content, s3_key, file.content_type or "application/octet-stream")

            metadata = DocumentMetadata(
                filename=safe_filename,
                title=title or file.filename,
                source=source or "upload",
                department=department,
                file_path=s3_key,
                file_size=len(content),
                status=ProcessingStatus.PENDING,
            )
            doc_id = await database_service.create_document(metadata)
            sqs_service.enqueue_document(
                document_id=doc_id,
                s3_key=s3_key,
                metadata={
                    "filename": safe_filename,
                    "title": title or file.filename,
                    "source": source or "upload",
                    "department": department,
                },
            )
        else:
            # ── Local dev path: file saved first, then DB record ─────────────
            os.makedirs(settings.upload_dir, exist_ok=True)
            upload_path = os.path.join(settings.upload_dir, safe_filename)
            with open(upload_path, "wb") as buf:
                buf.write(content)

            metadata = DocumentMetadata(
                filename=safe_filename,
                title=title or file.filename,
                source=source or "upload",
                department=department,
                file_path=upload_path,
                file_size=len(content),
                status=ProcessingStatus.PENDING,
            )
            doc_id = await database_service.create_document(metadata)
            background_tasks.add_task(process_document_background, doc_id, upload_path, metadata)

        return {
            "document_id": doc_id,
            "filename": file.filename,
            "status": "uploaded",
            "message": "Document uploaded successfully. Processing started in background.",
        }

    except HTTPException:
        raise
    except Exception as e:
        # ── Fix #2: never leak internal exception details to the client ───────
        logger.error(f"Error uploading document: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload document")


class DocumentProcessRequest(BaseModel):
    """Request model for document processing"""
    documentId: str
    filePath: str
    metadata: dict

@app.post("/documents/process")
async def process_document_json(
    background_tasks: BackgroundTasks,
    document_data: DocumentProcessRequest,
    _: None = Depends(require_api_key),
):
    """Process a document from JSON data (for testing/n8n integration)"""

    try:
        document_id = document_data.documentId
        file_path = document_data.filePath
        metadata = document_data.metadata

        doc_metadata = DocumentMetadata(
            filename=metadata.get("filename", "unknown"),
            title=metadata.get("title", "Unknown Document"),
            source=metadata.get("source", "n8n"),
            department=metadata.get("department", "general"),
            file_path=file_path,
            file_size=metadata.get("fileSize", 0),
            status=ProcessingStatus.PENDING
        )

        doc_id = await database_service.create_document(doc_metadata)
        background_tasks.add_task(process_document_background, doc_id, file_path, doc_metadata)

        return {
            "document_id": doc_id,
            "filename": doc_metadata.filename,
            "status": "processing",
            "message": "Document processing started successfully."
        }

    except Exception as e:
        logger.error(f"Error processing document: {e}")
        raise HTTPException(status_code=500, detail="Failed to start document processing")


async def process_document_background(
    doc_id: str,
    file_path: str,
    metadata: DocumentMetadata,
    delete_existing: bool = False,
):
    """Background task to process an uploaded document.

    When *delete_existing* is True (reprocess flow), existing Pinecone vectors
    are removed inside this task so the operation is atomic — a crash won't
    leave the document in an unrecoverable state.
    """

    try:
        logger.info(f"Processing document {doc_id}: {metadata.filename}")
        await database_service.update_document_status(doc_id, ProcessingStatus.PROCESSING)

        # ── Fix #10: Pinecone cleanup happens here, atomically ────────────────
        if delete_existing:
            await pinecone_service.delete_by_document_id(doc_id)

        text_content = await document_processor.extract_text(file_path)
        chunks = await document_processor.chunk_text(text_content, metadata.title, metadata.source)

        logger.info(f"Created {len(chunks)} chunks for document {doc_id}")

        embeddings = []
        for i, chunk in enumerate(chunks):
            embedding = await embedding_service.generate_embedding(chunk.content)
            chunk_metadata = {
                "document_id": doc_id,
                "chunk_index": i,
                "title": metadata.title,
                "source": metadata.source,
                "department": metadata.department or "general",
                "content": chunk.content,
                "filename": metadata.filename,
            }
            embeddings.append({
                "id": f"{doc_id}_chunk_{i}",
                "values": embedding,
                "metadata": chunk_metadata,
            })

        await pinecone_service.upsert_vectors(embeddings)
        await database_service.update_document_status(
            doc_id, ProcessingStatus.COMPLETED, chunk_count=len(chunks)
        )

        logger.info(f"Successfully processed document {doc_id}")

    except Exception as e:
        logger.error(f"Error processing document {doc_id}: {e}")
        await database_service.update_document_status(
            doc_id, ProcessingStatus.FAILED, error_message=str(e)
        )


@app.get("/documents/{document_id}/status")
async def get_document_status(document_id: str, _: None = Depends(require_api_key)):
    """Get processing status of a document"""

    try:
        document = await database_service.get_document(document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        return {
            "document_id": document_id,
            "status": document.status,
            "filename": document.filename,
            "chunk_count": document.chunk_count,
            "created_at": document.created_at,
            "updated_at": document.updated_at,
            "error_message": document.error_message,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting document status: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve document status")


# ── Fix #7: SSE stream with a hard timeout ────────────────────────────────────
_SSE_MAX_WAIT_SECONDS = 300  # 5 minutes

@app.get("/documents/{document_id}/status/stream")
async def stream_document_status(document_id: str):
    """SSE stream that pushes document status until processing finishes or times out."""

    async def event_generator():
        terminal = {"completed", "failed"}
        poll_interval = 2
        elapsed = 0

        while elapsed < _SSE_MAX_WAIT_SECONDS:
            if not database_service:
                yield f"event: error\ndata: {json.dumps({'detail': 'Service not ready'})}\n\n"
                return

            try:
                doc = await database_service.get_document(document_id)
                if not doc:
                    yield f"event: error\ndata: {json.dumps({'detail': 'Document not found'})}\n\n"
                    return

                payload = {
                    "document_id": document_id,
                    "status": doc.status.value if hasattr(doc.status, "value") else doc.status,
                    "chunk_count": doc.chunk_count,
                    "error_message": doc.error_message,
                }
                yield f"data: {json.dumps(payload)}\n\n"

                if payload["status"] in terminal:
                    return

            except Exception as e:
                logger.error(f"SSE error for document {document_id}: {e}")
                yield f"event: error\ndata: {json.dumps({'detail': 'Status check failed'})}\n\n"
                return

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        yield f"event: error\ndata: {json.dumps({'detail': 'Timed out waiting for processing'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/documents")
async def list_documents(
    department: Optional[str] = None,
    status: Optional[ProcessingStatus] = None,
    limit: int = 50,
    offset: int = 0,
    _: None = Depends(require_api_key),
):
    """List processed documents with optional filtering"""

    try:
        documents = await database_service.list_documents(
            department=department,
            status=status,
            limit=limit,
            offset=offset,
        )
        return {"documents": documents, "total": len(documents), "limit": limit, "offset": offset}

    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        raise HTTPException(status_code=500, detail="Failed to list documents")


@app.post("/embeddings/generate")
async def generate_embedding(request: EmbeddingRequest, _: None = Depends(require_api_key)):
    """Generate embedding for a text query"""

    try:
        embedding = await embedding_service.generate_embedding(request.text)
        return {
            "text": request.text,
            "embedding": embedding,
            "model": settings.embedding_model,
            "dimensions": len(embedding),
        }

    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate embedding")


@app.post("/search")
async def search_documents(request: QueryRequest, _: None = Depends(require_api_key)):
    """Search for relevant document chunks"""

    try:
        query_embedding = await embedding_service.generate_embedding(request.query)
        results = await pinecone_service.query_similar(
            vector=query_embedding,
            top_k=request.top_k,
            department_filter=request.department,
            include_metadata=True,
        )

        formatted_results = [
            {
                "id": match.id,
                "score": match.score,
                "content": match.metadata.get("content", ""),
                "title": match.metadata.get("title", ""),
                "source": match.metadata.get("source", ""),
                "department": match.metadata.get("department", ""),
                "filename": match.metadata.get("filename", ""),
            }
            for match in results.matches
        ]

        return {"query": request.query, "results": formatted_results, "total_results": len(formatted_results)}

    except Exception as e:
        logger.error(f"Error searching documents: {e}")
        raise HTTPException(status_code=500, detail="Failed to search documents")


# ── Fix #9: DB deleted first (authoritative state); Pinecone cleanup after ────
@app.delete("/documents/{document_id}")
async def delete_document(document_id: str, _: None = Depends(require_api_key)):
    """Delete a document and its embeddings.

    Order: DB record removed first (so the document immediately disappears from
    the system), then Pinecone vectors.  Pinecone delete is idempotent — if it
    fails the admin can re-run it; the DB record is already gone so there is no
    ghost entry pointing to stale data.
    """

    try:
        document = await database_service.get_document(document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        file_path = document.file_path
        filename = document.filename

        # DB first — document is gone from the user's perspective immediately
        await database_service.delete_document(document_id)

        # Then Pinecone (idempotent — safe to retry if this fails)
        await pinecone_service.delete_by_document_id(document_id)

        # Remove file from disk if present
        if file_path and os.path.exists(file_path):
            os.remove(file_path)

        return {"message": f"Document {document_id} deleted successfully", "filename": filename}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting document: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete document")


# ── Fix #10: Pinecone delete moved inside background task ────────────────────
@app.post("/reprocess/{document_id}")
async def reprocess_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    _: None = Depends(require_api_key),
):
    """Reprocess an existing document.

    The document is set to PENDING in the DB before the background task starts.
    The background task itself deletes old Pinecone vectors and re-embeds, so a
    crash between these steps leaves the document in a retriable FAILED state
    rather than permanently missing vectors.
    """

    try:
        document = await database_service.get_document(document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        await database_service.update_document_status(document_id, ProcessingStatus.PENDING)
        background_tasks.add_task(
            process_document_background,
            document_id,
            document.file_path,
            document,
            delete_existing=True,
        )

        return {"message": f"Document {document_id} reprocessing started", "filename": document.filename}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reprocessing document: {e}")
        raise HTTPException(status_code=500, detail="Failed to start reprocessing")


# ---------------------------------------------------------------------------
# AWS Lambda entry point (API Gateway → Mangum → FastAPI)
# ---------------------------------------------------------------------------
try:
    from mangum import Mangum
    lambda_handler = Mangum(app, lifespan="off")
except ImportError:
    lambda_handler = None


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info",
    )
