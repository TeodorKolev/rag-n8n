"""
Document management routes — JWT-authenticated upload, listing, and status
"""

import logging
import os
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile

from middleware.auth import get_current_user
from models import DocumentMetadata, ProcessingStatus
from services.database import DatabaseService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}
_UPLOAD_ROLES = {"admin", "manager"}


def get_db() -> DatabaseService:
    from main import database_service
    if database_service is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    return database_service


def require_uploader(user: dict = Depends(get_current_user)) -> dict:
    """Admin and manager roles may upload documents."""
    if user.get("role") not in _UPLOAD_ROLES:
        raise HTTPException(status_code=403, detail="Upload requires admin or manager role")
    return user


@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = None,
    source: Optional[str] = None,
    department: Optional[str] = None,
    user: dict = Depends(require_uploader),
    db: DatabaseService = Depends(get_db),
):
    from main import process_document_background
    from config import settings

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(_ALLOWED_EXTENSIONS)}",
        )

    try:
        content = await file.read()

        if len(content) > settings.max_file_size:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {settings.max_file_size // (1024 * 1024)} MB",
            )

        safe_filename = f"{uuid.uuid4().hex}{ext}"
        doc_department = department or user.get("department", "general")

        if settings.s3_bucket and settings.sqs_queue_url:
            from services import s3_service, sqs_service
            s3_key = f"uploads/{safe_filename}"
            await s3_service.upload_file(content, s3_key, file.content_type or "application/octet-stream")
            metadata = DocumentMetadata(
                filename=safe_filename,
                title=title or file.filename,
                source=source or "upload",
                department=doc_department,
                file_path=s3_key,
                file_size=len(content),
                status=ProcessingStatus.PENDING,
            )
            doc_id = await db.create_document(metadata)
            sqs_service.enqueue_document(
                document_id=doc_id,
                s3_key=s3_key,
                metadata={"filename": safe_filename, "title": title or file.filename,
                          "source": source or "upload", "department": doc_department},
            )
        else:
            os.makedirs(settings.upload_dir, exist_ok=True)
            upload_path = os.path.join(settings.upload_dir, safe_filename)
            with open(upload_path, "wb") as buf:
                buf.write(content)
            metadata = DocumentMetadata(
                filename=safe_filename,
                title=title or file.filename,
                source=source or "upload",
                department=doc_department,
                file_path=upload_path,
                file_size=len(content),
                status=ProcessingStatus.PENDING,
            )
            doc_id = await db.create_document(metadata)
            background_tasks.add_task(process_document_background, doc_id, upload_path, metadata)

        return {
            "document_id": doc_id,
            "filename": file.filename,
            "title": title or file.filename,
            "department": doc_department,
            "status": "uploaded",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading document: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload document")


@router.get("")
async def list_documents(
    department: Optional[str] = None,
    status: Optional[ProcessingStatus] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
    db: DatabaseService = Depends(get_db),
):
    # Non-admin/manager users only see their own department
    if user.get("role") not in ("admin", "manager"):
        department = user.get("department", "general")

    try:
        documents = await db.list_documents(
            department=department, status=status, limit=limit, offset=offset
        )
        return {"documents": documents, "total": len(documents), "limit": limit, "offset": offset}
    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        raise HTTPException(status_code=500, detail="Failed to list documents")


@router.get("/{document_id}/status")
async def get_document_status(
    document_id: str,
    user: dict = Depends(get_current_user),
    db: DatabaseService = Depends(get_db),
):
    try:
        doc = await db.get_document(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return {
            "document_id": document_id,
            "status": doc.status,
            "filename": doc.filename,
            "chunk_count": doc.chunk_count,
            "error_message": doc.error_message,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting document status: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve document status")
