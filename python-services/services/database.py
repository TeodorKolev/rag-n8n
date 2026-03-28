"""
Database service for storing document metadata and processing status
"""

import logging
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
                        "document_id": str(result['id']),
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
    
    # ------------------------------------------------------------------
    # User operations
    # ------------------------------------------------------------------

    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        query = """
        SELECT id, email, password_hash, first_name, last_name, role, department, is_active, last_login
        FROM users WHERE email = $1;
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(query, email)
            return dict(row) if row else None

    async def create_user(
        self,
        email: str,
        password_hash: str,
        first_name: str,
        last_name: str,
        role: str = "user",
        department: str = "general",
    ) -> Dict[str, Any]:
        query = """
        INSERT INTO users (email, password_hash, first_name, last_name, role, department)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, password_hash, first_name, last_name, role, department, is_active;
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(query, email, password_hash, first_name, last_name, role, department)
            return dict(row)

    async def update_last_login(self, user_id: str):
        async with self.pool.acquire() as conn:
            await conn.execute("UPDATE users SET last_login = NOW() WHERE id = $1;", user_id)

    async def list_users(
        self,
        role: Optional[str] = None,
        department: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        conditions, params, idx = [], [], 0

        if role:
            idx += 1
            conditions.append(f"role = ${idx}")
            params.append(role)
        if department:
            idx += 1
            conditions.append(f"department = ${idx}")
            params.append(department)

        where = "WHERE " + " AND ".join(conditions) if conditions else ""
        idx += 1; params.append(limit)
        idx += 1; params.append(offset)

        query = f"""
        SELECT id, email, first_name, last_name, role, department, is_active, last_login, created_at
        FROM users {where}
        ORDER BY created_at DESC LIMIT ${idx - 1} OFFSET ${idx};
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    async def update_user_role(self, user_id: str, role: str):
        async with self.pool.acquire() as conn:
            await conn.execute("UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1;", user_id, role)

    # ------------------------------------------------------------------
    # Conversation operations
    # ------------------------------------------------------------------

    async def create_conversation(
        self,
        user_id: str,
        query: str,
        department: str,
        session_id: Optional[str] = None,
    ) -> str:
        sql = """
        INSERT INTO conversations (user_id, session_id, query, department, status)
        VALUES ($1::uuid, $2, $3, $4, 'pending')
        RETURNING id;
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(sql, user_id, session_id, query, department)
            return str(row["id"])

    async def update_conversation(
        self,
        conversation_id: str,
        answer: Optional[str] = None,
        sources: Optional[list] = None,
        metadata: Optional[dict] = None,
        status: Optional[str] = None,
        error: Optional[str] = None,
    ):
        import json
        sql = """
        UPDATE conversations SET
            answer = COALESCE($2, answer),
            sources = COALESCE($3::jsonb, sources),
            metadata = COALESCE($4::jsonb, metadata),
            status = COALESCE($5, status),
            error_message = COALESCE($6, error_message),
            updated_at = NOW()
        WHERE id = $1::uuid;
        """
        async with self.pool.acquire() as conn:
            await conn.execute(
                sql,
                conversation_id,
                answer,
                json.dumps(sources) if sources is not None else None,
                json.dumps(metadata) if metadata is not None else None,
                status,
                error,
            )

    async def get_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        sql = """
        SELECT id, user_id, session_id, query, answer, department, sources, metadata,
               status, error_message, created_at, updated_at
        FROM conversations WHERE id = $1::uuid;
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(sql, conversation_id)
            return dict(row) if row else None

    async def get_conversation_history(
        self,
        user_id: Optional[str],
        limit: int = 20,
        offset: int = 0,
        department: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        conditions, params, idx = [], [], 0

        if user_id:
            idx += 1
            conditions.append(f"user_id = ${idx}::uuid")
            params.append(user_id)
        if session_id:
            idx += 1
            conditions.append(f"session_id = ${idx}")
            params.append(session_id)
        if department:
            idx += 1
            conditions.append(f"department = ${idx}")
            params.append(department)

        where = "WHERE " + " AND ".join(conditions) if conditions else ""
        idx += 1; params.append(limit)
        idx += 1; params.append(offset)

        sql = f"""
        SELECT id, user_id, session_id, query, answer, department, status, created_at
        FROM conversations {where}
        ORDER BY created_at DESC LIMIT ${idx - 1} OFFSET ${idx};
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)
            return [dict(r) for r in rows]

    async def get_session_conversations(
        self, session_id: str, limit: int = 50, offset: int = 0
    ) -> List[Dict[str, Any]]:
        sql = """
        SELECT id, session_id, query, answer, department, status, created_at
        FROM conversations WHERE session_id = $1
        ORDER BY created_at DESC LIMIT $2 OFFSET $3;
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(sql, session_id, limit, offset)
            return [dict(r) for r in rows]

    async def delete_conversation(self, conversation_id: str):
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE conversations SET status = 'failed', updated_at = NOW() WHERE id = $1::uuid;",
                conversation_id,
            )

    async def submit_feedback(
        self,
        conversation_id: str,
        user_id: Optional[str],
        rating: int,
        feedback_text: Optional[str] = None,
    ):
        if not user_id:
            return  # feedback requires a real user in the schema
        sql = """
        INSERT INTO feedback (conversation_id, user_id, rating, feedback_text)
        VALUES ($1::uuid, $2::uuid, $3, $4)
        ON CONFLICT DO NOTHING;
        """
        async with self.pool.acquire() as conn:
            await conn.execute(sql, conversation_id, user_id, rating, feedback_text)

    async def get_analytics_summary(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        department: Optional[str] = None,
    ) -> Dict[str, Any]:
        conditions, params, idx = [], [], 0

        if start_date:
            idx += 1
            conditions.append(f"created_at >= ${idx}")
            params.append(start_date)
        if end_date:
            idx += 1
            conditions.append(f"created_at <= ${idx}")
            params.append(end_date)
        if department:
            idx += 1
            conditions.append(f"department = ${idx}")
            params.append(department)

        where = "WHERE " + " AND ".join(conditions) if conditions else ""
        sql = f"""
        SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
            AVG(processing_time_ms) as avg_processing_time_ms
        FROM conversations {where};
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(sql, *params)
            return dict(row) if row else {}

    # ------------------------------------------------------------------
    # Admin log queries
    # ------------------------------------------------------------------

    async def get_processing_logs_filtered(
        self,
        level: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        conditions, params, idx = [], [], 0

        if level:
            idx += 1
            conditions.append(f"status = ${idx}")
            params.append(level)
        if start:
            idx += 1
            conditions.append(f"created_at >= ${idx}")
            params.append(start)
        if end:
            idx += 1
            conditions.append(f"created_at <= ${idx}")
            params.append(end)

        where = "WHERE " + " AND ".join(conditions) if conditions else ""
        idx += 1; params.append(limit)

        sql = f"""
        SELECT id, document_id, status, message, processing_time_ms, created_at
        FROM processing_logs {where}
        ORDER BY created_at DESC LIMIT ${idx};
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)
            return [dict(r) for r in rows]

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
