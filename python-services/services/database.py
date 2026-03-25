"""
Database service for storing document metadata and processing status
"""

import logging
import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any
import asyncpg
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from models import DocumentMetadata, ProcessingStatus

logger = logging.getLogger(__name__)


class DatabaseService:
    """Service for database operations"""
    
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.async_engine = None
        self.async_session_factory = None
        self.pool = None
        
        logger.info("Initializing DatabaseService")
    
    async def initialize(self):
        """Initialize database connection and create tables"""
        
        try:
            # Create connection pool for direct queries
            self.pool = await asyncpg.create_pool(
                self.database_url,
                min_size=5,
                max_size=20
            )
            
            # Create tables if they don't exist
            await self._create_tables()
            
            logger.info("Database service initialized successfully")
            
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
            raise
    
    async def close(self):
        """Close database connections"""
        
        if self.pool:
            await self.pool.close()
            logger.info("Database connections closed")
    
    async def _create_tables(self):
        """Create necessary database tables"""
        
        create_documents_table = """
        CREATE TABLE IF NOT EXISTS documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            filename VARCHAR(255) NOT NULL,
            title VARCHAR(500) NOT NULL,
            source VARCHAR(100) NOT NULL,
            department VARCHAR(100),
            file_path VARCHAR(500) NOT NULL,
            file_size BIGINT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            chunk_count INTEGER,
            error_message TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """
        
        create_processing_logs_table = """
        CREATE TABLE IF NOT EXISTS processing_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
            status VARCHAR(20) NOT NULL,
            message TEXT,
            processing_time_ms INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """
        
        create_indexes = """
        CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
        CREATE INDEX IF NOT EXISTS idx_documents_department ON documents(department);
        CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
        CREATE INDEX IF NOT EXISTS idx_processing_logs_document_id ON processing_logs(document_id);
        """
        
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(create_documents_table)
                await conn.execute(create_processing_logs_table)
                await conn.execute(create_indexes)
                
            logger.info("Database tables created/verified successfully")
            
        except Exception as e:
            logger.error(f"Error creating database tables: {e}")
            raise
    
    async def create_document(self, metadata: DocumentMetadata) -> str:
        """Create a new document record"""
        
        try:
            query = """
            INSERT INTO documents (filename, title, source, department, file_path, file_size, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id;
            """
            
            async with self.pool.acquire() as conn:
                result = await conn.fetchrow(
                    query,
                    metadata.filename,
                    metadata.title,
                    metadata.source,
                    metadata.department,
                    metadata.file_path,
                    metadata.file_size,
                    metadata.status
                )
                
                document_id = str(result['id'])
                logger.info(f"Created document record: {document_id}")
                
                return document_id
                
        except Exception as e:
            logger.error(f"Error creating document: {e}")
            raise
    
    async def get_document(self, document_id: str) -> Optional[DocumentMetadata]:
        """Get document by ID"""
        
        try:
            query = """
            SELECT id, filename, title, source, department, file_path, file_size, 
                   status, chunk_count, error_message, created_at, updated_at
            FROM documents
            WHERE id = $1;
            """
            
            async with self.pool.acquire() as conn:
                result = await conn.fetchrow(query, document_id)
                
                if not result:
                    return None
                
                return DocumentMetadata(
                    filename=result['filename'],
                    title=result['title'],
                    source=result['source'],
                    department=result['department'],
                    file_path=result['file_path'],
                    file_size=result['file_size'],
                    status=ProcessingStatus(result['status']),
                    chunk_count=result['chunk_count'],
                    error_message=result['error_message'],
                    created_at=result['created_at'],
                    updated_at=result['updated_at']
                )
                
        except Exception as e:
            logger.error(f"Error getting document {document_id}: {e}")
            raise
    
    async def update_document_status(
        self, 
        document_id: str, 
        status: ProcessingStatus, 
        chunk_count: Optional[int] = None,
        error_message: Optional[str] = None
    ):
        """Update document processing status"""
        
        try:
            query = """
            UPDATE documents 
            SET status = $2, chunk_count = $3, error_message = $4, updated_at = NOW()
            WHERE id = $1;
            """
            
            async with self.pool.acquire() as conn:
                await conn.execute(query, document_id, status, chunk_count, error_message)
                
                # Log the status change
                await self._log_processing_status(document_id, status, error_message)
                
            logger.info(f"Updated document {document_id} status to {status.value}")
            
        except Exception as e:
            logger.error(f"Error updating document status: {e}")
            raise
    
    async def list_documents(
        self,
        department: Optional[str] = None,
        status: Optional[ProcessingStatus] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """List documents with optional filtering"""
        
        try:
            conditions = []
            params = []
            param_count = 0
            
            if department:
                param_count += 1
                conditions.append(f"department = ${param_count}")
                params.append(department)
            
            if status:
                param_count += 1
                conditions.append(f"status = ${param_count}")
                params.append(status.value)
            
            where_clause = ""
            if conditions:
                where_clause = "WHERE " + " AND ".join(conditions)
            
            param_count += 1
            limit_param = f"${param_count}"
            params.append(limit)
            
            param_count += 1
            offset_param = f"${param_count}"
            params.append(offset)
            
            query = f"""
            SELECT id, filename, title, source, department, file_size, 
                   status, chunk_count, created_at, updated_at
            FROM documents
            {where_clause}
            ORDER BY created_at DESC
            LIMIT {limit_param} OFFSET {offset_param};
            """
            
            async with self.pool.acquire() as conn:
                results = await conn.fetch(query, *params)
                
                documents = []
                for result in results:
                    documents.append({
                        "id": str(result['id']),
                        "filename": result['filename'],
                        "title": result['title'],
                        "source": result['source'],
                        "department": result['department'],
                        "file_size": result['file_size'],
                        "status": result['status'],
                        "chunk_count": result['chunk_count'],
                        "created_at": result['created_at'],
                        "updated_at": result['updated_at']
                    })
                
                logger.debug(f"Listed {len(documents)} documents")
                return documents
                
        except Exception as e:
            logger.error(f"Error listing documents: {e}")
            raise
    
    async def delete_document(self, document_id: str):
        """Delete a document record"""
        
        try:
            query = "DELETE FROM documents WHERE id = $1;"
            
            async with self.pool.acquire() as conn:
                await conn.execute(query, document_id)
                
            logger.info(f"Deleted document: {document_id}")
            
        except Exception as e:
            logger.error(f"Error deleting document {document_id}: {e}")
            raise
    
    async def _log_processing_status(
        self, 
        document_id: str, 
        status: ProcessingStatus, 
        message: Optional[str] = None
    ):
        """Log processing status change"""
        
        try:
            query = """
            INSERT INTO processing_logs (document_id, status, message)
            VALUES ($1, $2, $3);
            """
            
            async with self.pool.acquire() as conn:
                await conn.execute(query, document_id, status.value, message)
                
        except Exception as e:
            logger.error(f"Error logging processing status: {e}")
            # Don't raise here as this is just logging
    
    async def get_processing_logs(self, document_id: str) -> List[Dict[str, Any]]:
        """Get processing logs for a document"""
        
        try:
            query = """
            SELECT status, message, processing_time_ms, created_at
            FROM processing_logs
            WHERE document_id = $1
            ORDER BY created_at DESC;
            """
            
            async with self.pool.acquire() as conn:
                results = await conn.fetch(query, document_id)
                
                logs = []
                for result in results:
                    logs.append({
                        "status": result['status'],
                        "message": result['message'],
                        "processing_time_ms": result['processing_time_ms'],
                        "created_at": result['created_at']
                    })
                
                return logs
                
        except Exception as e:
            logger.error(f"Error getting processing logs: {e}")
            raise
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get database statistics"""
        
        try:
            query = """
            SELECT 
                COUNT(*) as total_documents,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_documents,
                COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_documents,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_documents,
                SUM(chunk_count) as total_chunks,
                SUM(file_size) as total_file_size
            FROM documents;
            """
            
            async with self.pool.acquire() as conn:
                result = await conn.fetchrow(query)
                
                return {
                    "total_documents": result['total_documents'],
                    "completed_documents": result['completed_documents'],
                    "processing_documents": result['processing_documents'],
                    "failed_documents": result['failed_documents'],
                    "total_chunks": result['total_chunks'] or 0,
                    "total_file_size": result['total_file_size'] or 0
                }
                
        except Exception as e:
            logger.error(f"Error getting database stats: {e}")
            raise
