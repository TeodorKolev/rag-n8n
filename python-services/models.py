"""
Data models for the document processing service
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ProcessingStatus(str, Enum):
    """Document processing status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class DocumentMetadata(BaseModel):
    """Document metadata model"""
    filename: str
    title: str
    source: str
    department: Optional[str] = None
    file_path: str
    file_size: int
    status: ProcessingStatus = ProcessingStatus.PENDING
    chunk_count: Optional[int] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        use_enum_values = True


class DocumentChunk(BaseModel):
    """Text chunk from a document"""
    content: str
    chunk_index: int
    title: str
    source: str
    metadata: Dict[str, Any] = {}


class EmbeddingRequest(BaseModel):
    """Request model for generating embeddings"""
    text: str
    model: Optional[str] = None


class QueryRequest(BaseModel):
    """Request model for searching documents"""
    query: str
    top_k: int = Field(default=5, ge=1, le=20)
    department: Optional[str] = None
    source: Optional[str] = None
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)


class QueryResult(BaseModel):
    """Search result model"""
    id: str
    score: float
    content: str
    title: str
    source: str
    department: str
    filename: str
    chunk_index: int


class SearchResponse(BaseModel):
    """Response model for search queries"""
    query: str
    results: List[QueryResult]
    total_results: int
    processing_time_ms: float


class DocumentUploadResponse(BaseModel):
    """Response model for document upload"""
    document_id: str
    filename: str
    status: str
    message: str


class DocumentStatusResponse(BaseModel):
    """Response model for document status"""
    document_id: str
    status: ProcessingStatus
    filename: str
    chunk_count: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    error_message: Optional[str] = None


class DocumentListResponse(BaseModel):
    """Response model for document listing"""
    documents: List[DocumentStatusResponse]
    total: int
    limit: int
    offset: int


class HealthCheckResponse(BaseModel):
    """Response model for health check"""
    status: str
    services: Dict[str, bool]
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class EmbeddingResponse(BaseModel):
    """Response model for embedding generation"""
    text: str
    embedding: List[float]
    model: str
    dimensions: int
