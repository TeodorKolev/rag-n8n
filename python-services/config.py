"""
Configuration settings for the document processing service
"""

import os
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # API Keys
    pinecone_api_key: str
    pinecone_environment: str
    pinecone_index_name: str = "rag-assistant"
    
    openai_api_key: str
    claude_api_key: Optional[str] = None
    
    # Database
    database_url: str
    redis_url: str = "redis://localhost:6379"
    
    # Document Processing
    max_chunk_size: int = 1000
    chunk_overlap: int = 200
    embedding_model: str = "sentence-transformers/all-mpnet-base-v2"
    
    # Application
    environment: str = "development"
    log_level: str = "info"
    
    # File Upload
    max_file_size: int = 100 * 1024 * 1024  # 100MB
    upload_dir: str = "uploads"

    # Processing
    max_concurrent_processes: int = 5

    # Security
    python_service_api_key: str
    allowed_origins: str = "http://localhost:3000,http://localhost:8000"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()
