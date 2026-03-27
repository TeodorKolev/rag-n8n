"""
Admin routes — stats, users, logs, health, maintenance
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from middleware.auth import require_admin
from services.database import DatabaseService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

VALID_ROLES = {"admin", "user", "manager"}
VALID_ACTIONS = {"backup", "cleanup", "restart"}


def get_db() -> DatabaseService:
    from main import database_service
    if database_service is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    return database_service


class UpdateRoleRequest(BaseModel):
    role: str


class MaintenanceRequest(BaseModel):
    action: str


@router.get("/stats")
async def get_stats(
    _: dict = Depends(require_admin),
    db: DatabaseService = Depends(get_db),
):
    doc_stats = await db.get_stats()
    return {
        "documents": {
            "total": doc_stats["total_documents"],
            "processed": doc_stats["completed_documents"],
            "processing": doc_stats["processing_documents"],
            "failed": doc_stats["failed_documents"],
        },
        "system": {
            "uptime": "unknown",
        },
    }


@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    role: Optional[str] = None,
    department: Optional[str] = None,
    _: dict = Depends(require_admin),
    db: DatabaseService = Depends(get_db),
):
    offset = (page - 1) * limit
    users = await db.list_users(role=role, department=department, limit=limit, offset=offset)
    return {
        "users": users,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": len(users),
        },
    }


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: UpdateRoleRequest,
    _: dict = Depends(require_admin),
    db: DatabaseService = Depends(get_db),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(VALID_ROLES)}")
    await db.update_user_role(user_id, body.role)
    return {"message": "User role updated successfully", "userId": user_id, "newRole": body.role}


@router.get("/logs")
async def get_logs(
    level: Optional[str] = None,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    _: dict = Depends(require_admin),
    db: DatabaseService = Depends(get_db),
):
    from datetime import datetime
    start = datetime.fromisoformat(startDate) if startDate else None
    end = datetime.fromisoformat(endDate) if endDate else None
    logs = await db.get_processing_logs_filtered(level=level, start=start, end=end, limit=limit)
    return {"logs": logs, "total": len(logs), "filters": {"level": level, "startDate": startDate, "endDate": endDate}}


@router.get("/health")
async def admin_health(_: dict = Depends(require_admin), db: DatabaseService = Depends(get_db)):
    db_ok = False
    try:
        await db.get_stats()
        db_ok = True
    except Exception:
        pass

    return {
        "status": "healthy" if db_ok else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {"database": "healthy" if db_ok else "unhealthy"},
    }


@router.post("/maintenance")
async def maintenance(body: MaintenanceRequest, _: dict = Depends(require_admin)):
    if body.action not in VALID_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Action must be one of: {', '.join(VALID_ACTIONS)}")
    return {
        "message": f"Maintenance action '{body.action}' initiated successfully",
        "action": body.action,
        "timestamp": datetime.utcnow().isoformat(),
    }
