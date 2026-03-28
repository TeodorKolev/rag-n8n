"""
Configuration settings for the document processing service
"""

import os
from pydantic_settings import BaseSettings
from pydantic import model_validator
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
    embedding_model: str = "text-embedding-ada-002"
    
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

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_expires_in: int = 86400  # seconds (24h)

    # n8n
    n8n_host: str = "n8n"
    n8n_port: int = 5678
    n8n_protocol: str = "http"
    n8n_basic_auth_user: str = "admin"
    n8n_basic_auth_password: str = "password"

    # Rate limiting
    rate_limit_requests: int = 100
    rate_limit_window: int = 60  # seconds

    # AWS (used by SQS worker + S3 file storage)
    aws_region: str = "us-east-1"
    s3_bucket: Optional[str] = None        # required in production
    sqs_queue_url: Optional[str] = None    # required in production
    
    @model_validator(mode="after")
    def check_production_secrets(self) -> "Settings":
        """Fail fast if insecure defaults are used in production."""
        if self.environment == "production":
            if self.jwt_secret == "change-me-in-production":
                raise ValueError("JWT_SECRET must be set to a strong random value in production")
            if self.n8n_basic_auth_password == "password":
                raise ValueError("N8N_BASIC_AUTH_PASSWORD must be set in production")
            if self.python_service_api_key in ("", "changeme"):
                raise ValueError("PYTHON_SERVICE_API_KEY must be set in production")
        return self

    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()
