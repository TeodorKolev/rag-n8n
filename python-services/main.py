"""
Python Document Processing Service for RAG Assistant
Handles document ingestion, preprocessing, embedding generation, and Pinecone storage.
"""

import os
import logging
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from services.document_processor import DocumentProcessor
from services.embedding_service import EmbeddingService
from services.pinecone_service import PineconeService
from services.database import DatabaseService
from config import settings
from models import DocumentMetadata, ProcessingStatus, EmbeddingRequest, QueryRequest

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
        # Initialize services
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
    
    # Cleanup on shutdown
    logger.info("Shutting down services...")
    if database_service:
        await database_service.close()


app = FastAPI(
    title="RAG Document Processing Service",
    description="Microservice for document processing, embedding generation, and vector storage",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
_allowed_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)


async def require_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    if x_api_key != settings.python_service_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "services": {
            "document_processor": document_processor is not None,
            "embedding_service": embedding_service is not None,
            "pinecone_service": pinecone_service is not None,
            "database_service": database_service is not None
        }
    }


@app.post("/documents/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = None,
    source: Optional[str] = None,
    department: Optional[str] = None,
    _: None = Depends(require_api_key)
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
        # Save uploaded file
        upload_path = f"uploads/{file.filename}"
        with open(upload_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Create document metadata
        metadata = DocumentMetadata(
            filename=file.filename,
            title=title or file.filename,
            source=source or "upload",
            department=department,
            file_path=upload_path,
            file_size=len(content),
            status=ProcessingStatus.PENDING
        )
        
        # Store metadata in database
        doc_id = await database_service.create_document(metadata)
        
        # Process document in background
        background_tasks.add_task(process_document_background, doc_id, upload_path, metadata)
        
        return {
            "document_id": doc_id,
            "filename": file.filename,
            "status": "uploaded",
            "message": "Document uploaded successfully. Processing started in background."
        }
        
    except Exception as e:
        logger.error(f"Error uploading document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class DocumentProcessRequest(BaseModel):
    """Request model for document processing"""
    documentId: str
    filePath: str
    metadata: dict

@app.post("/documents/process")
async def process_document_json(
    background_tasks: BackgroundTasks,
    document_data: DocumentProcessRequest,
    _: None = Depends(require_api_key)
):
    """Process a document from JSON data (for testing/n8n integration)"""
    
    try:
        # Extract data from JSON
        document_id = document_data.documentId
        file_path = document_data.filePath
        metadata = document_data.metadata
        
        # Create document metadata
        doc_metadata = DocumentMetadata(
            filename=metadata.get("filename", "unknown"),
            title=metadata.get("title", "Unknown Document"),
            source=metadata.get("source", "n8n"),
            department=metadata.get("department", "general"),
            file_path=file_path,
            file_size=metadata.get("fileSize", 0),
            status=ProcessingStatus.PENDING
        )
        
        # Store metadata in database
        doc_id = await database_service.create_document(doc_metadata)
        
        # Process document in background
        background_tasks.add_task(process_document_background, doc_id, file_path, doc_metadata)
        
        return {
            "document_id": doc_id,
            "filename": doc_metadata.filename,
            "status": "processing",
            "message": "Document processing started successfully."
        }
        
    except Exception as e:
        logger.error(f"Error processing document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def process_document_background(doc_id: str, file_path: str, metadata: DocumentMetadata):
    """Background task to process uploaded document"""
    
    try:
        logger.info(f"Processing document {doc_id}: {metadata.filename}")
        
        # Update status to processing
        await database_service.update_document_status(doc_id, ProcessingStatus.PROCESSING)
        
        # Extract text from document
        text_content = await document_processor.extract_text(file_path)
        
        # Chunk the document
        chunks = await document_processor.chunk_text(
            text_content, 
            metadata.title,
            metadata.source
        )
        
        logger.info(f"Created {len(chunks)} chunks for document {doc_id}")
        
        # Generate embeddings for each chunk
        embeddings = []
        for i, chunk in enumerate(chunks):
            embedding = await embedding_service.generate_embedding(chunk.content)
            
            # Prepare metadata for Pinecone
            chunk_metadata = {
                "document_id": doc_id,
                "chunk_index": i,
                "title": metadata.title,
                "source": metadata.source,
                "department": metadata.department or "general",
                "content": chunk.content,
                "filename": metadata.filename
            }
            
            embeddings.append({
                "id": f"{doc_id}_chunk_{i}",
                "values": embedding,
                "metadata": chunk_metadata
            })
        
        # Store embeddings in Pinecone
        await pinecone_service.upsert_vectors(embeddings)
        
        # Update document status to completed
        await database_service.update_document_status(
            doc_id, 
            ProcessingStatus.COMPLETED,
            chunk_count=len(chunks)
        )
        
        logger.info(f"Successfully processed document {doc_id}")
        
    except Exception as e:
        logger.error(f"Error processing document {doc_id}: {e}")
        await database_service.update_document_status(
            doc_id, 
            ProcessingStatus.FAILED,
            error_message=str(e)
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
            "error_message": document.error_message
        }
        
    except Exception as e:
        logger.error(f"Error getting document status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/documents")
async def list_documents(
    department: Optional[str] = None,
    status: Optional[ProcessingStatus] = None,
    limit: int = 50,
    offset: int = 0,
    _: None = Depends(require_api_key)
):
    """List processed documents with optional filtering"""
    
    try:
        documents = await database_service.list_documents(
            department=department,
            status=status,
            limit=limit,
            offset=offset
        )
        
        return {
            "documents": documents,
            "total": len(documents),
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/embeddings/generate")
async def generate_embedding(request: EmbeddingRequest, _: None = Depends(require_api_key)):
    """Generate embedding for a text query"""
    
    try:
        embedding = await embedding_service.generate_embedding(request.text)
        
        return {
            "text": request.text,
            "embedding": embedding,
            "model": settings.embedding_model,
            "dimensions": len(embedding)
        }
        
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search")
async def search_documents(request: QueryRequest, _: None = Depends(require_api_key)):
    """Search for relevant document chunks"""
    
    try:
        # Generate embedding for query
        query_embedding = await embedding_service.generate_embedding(request.query)
        
        # Search in Pinecone
        results = await pinecone_service.query_similar(
            vector=query_embedding,
            top_k=request.top_k,
            department_filter=request.department,
            include_metadata=True
        )
        
        # Format results
        formatted_results = []
        for match in results.matches:
            formatted_results.append({
                "id": match.id,
                "score": match.score,
                "content": match.metadata.get("content", ""),
                "title": match.metadata.get("title", ""),
                "source": match.metadata.get("source", ""),
                "department": match.metadata.get("department", ""),
                "filename": match.metadata.get("filename", "")
            })
        
        return {
            "query": request.query,
            "results": formatted_results,
            "total_results": len(formatted_results)
        }
        
    except Exception as e:
        logger.error(f"Error searching documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/documents/{document_id}")
async def delete_document(document_id: str, _: None = Depends(require_api_key)):
    """Delete a document and its embeddings"""
    
    try:
        # Get document info
        document = await database_service.get_document(document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Delete from Pinecone (all chunks for this document)
        await pinecone_service.delete_by_document_id(document_id)
        
        # Delete from database
        await database_service.delete_document(document_id)
        
        # Delete file if it exists
        if os.path.exists(document.file_path):
            os.remove(document.file_path)
        
        return {
            "message": f"Document {document_id} deleted successfully",
            "filename": document.filename
        }
        
    except Exception as e:
        logger.error(f"Error deleting document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reprocess/{document_id}")
async def reprocess_document(document_id: str, background_tasks: BackgroundTasks, _: None = Depends(require_api_key)):
    """Reprocess an existing document"""
    
    try:
        # Get document info
        document = await database_service.get_document(document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Delete existing embeddings
        await pinecone_service.delete_by_document_id(document_id)
        
        # Reprocess in background
        background_tasks.add_task(process_document_background, document_id, document.file_path, document)
        
        return {
            "message": f"Document {document_id} reprocessing started",
            "filename": document.filename
        }
        
    except Exception as e:
        logger.error(f"Error reprocessing document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )
