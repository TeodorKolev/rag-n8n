"""
Conversation routes — RAG queries and history
"""

import base64
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, conint, constr

from middleware.auth import get_optional_user
from services import cache_service, n8n_service
from services.database import DatabaseService
from limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["conversations"])

VALID_DEPARTMENTS = {"finance", "care", "sales", "hr", "general"}


# ---------- Request / Response models ----------

class QueryRequest(BaseModel):
    query: constr(min_length=1, max_length=1000)
    department: Optional[str] = "general"
    sessionId: Optional[constr(min_length=1, max_length=100)] = None


class FeedbackRequest(BaseModel):
    rating: conint(ge=1, le=5)
    feedback: Optional[constr(max_length=1000)] = None


# ---------- Dependency ----------

def get_db() -> DatabaseService:
    from main import database_service
    if database_service is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    return database_service


# ---------- Routes ----------

@router.post("/query")
@limiter.limit("30/minute")
async def query(
    request: Request,
    body: QueryRequest,
    user: Optional[dict] = Depends(get_optional_user),
    db: DatabaseService = Depends(get_db),
):
    department = body.department if body.department in VALID_DEPARTMENTS else "general"
    user_id = (user.get("userId") or user.get("sub")) if user else None
    session_id = body.sessionId or f"anonymous_{user_id or 'guest'}"
    effective_user_id = user_id or session_id

    logger.info(f"New query — department={department}, session={session_id}, length={len(body.query)}")

    # Deduplicate recent identical queries
    cache_key = f"recent_query:{effective_user_id}:{base64.b64encode(body.query.encode()).decode()}"
    cached = await cache_service.get(cache_key)
    if cached:
        logger.info("Returning cached response for duplicate query")
        return cached

    # Only persist to DB when we have a real authenticated user
    conversation_id = session_id
    if user_id:
        try:
            conversation_id = await db.create_conversation(
                user_id=user_id,
                query=body.query,
                department=department,
                session_id=session_id,
            )
        except Exception as e:
            logger.error(f"Failed to create conversation record: {e}")
            # Non-fatal — still process the query

    try:
        response = await n8n_service.process_query(
            query=body.query,
            department=department,
            user_id=effective_user_id,
            session_id=session_id,
            conversation_id=conversation_id,
        )
    except RuntimeError as e:
        if user_id and conversation_id != session_id:
            await db.update_conversation(conversation_id, status="failed", error=str(e))
        raise HTTPException(status_code=502, detail=str(e))

    if user_id and conversation_id != session_id:
        try:
            await db.update_conversation(
                conversation_id,
                answer=response.get("answer"),
                sources=response.get("sources", []),
                metadata=response.get("metadata", {}),
                status="completed",
            )
        except Exception as e:
            logger.error(f"Failed to update conversation {conversation_id}: {e}")

    result = {"conversationId": conversation_id, **response}
    await cache_service.set(cache_key, result, ttl=300)
    return result


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    db: DatabaseService = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    conv = await db.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.get("")
async def list_conversations(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    department: Optional[str] = None,
    sessionId: Optional[str] = None,
    user: Optional[dict] = Depends(get_optional_user),
    db: DatabaseService = Depends(get_db),
):
    user_id = (user.get("userId") or user.get("sub")) if user else None
    return await db.get_conversation_history(
        user_id=user_id,
        limit=limit,
        offset=offset,
        department=department,
        session_id=sessionId,
    )


@router.post("/{conversation_id}/feedback", status_code=status.HTTP_200_OK)
async def submit_feedback(
    conversation_id: str,
    body: FeedbackRequest,
    user: dict = Depends(get_optional_user),
    db: DatabaseService = Depends(get_db),
):
    conv = await db.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    user_id = (user.get("userId") or user.get("sub")) if user else None
    await db.submit_feedback(
        conversation_id=conversation_id,
        user_id=user_id,
        rating=body.rating,
        feedback_text=body.feedback,
    )
    return {"message": "Feedback submitted successfully", "conversationId": conversation_id}


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    user: dict = Depends(get_optional_user),
    db: DatabaseService = Depends(get_db),
):
    conv = await db.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete_conversation(conversation_id)
    return {"message": "Conversation deleted successfully", "conversationId": conversation_id}


@router.get("/sessions/{session_id}")
async def get_session_conversations(
    session_id: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: DatabaseService = Depends(get_db),
):
    conversations = await db.get_session_conversations(session_id, limit=limit, offset=offset)
    return {"sessionId": session_id, "conversations": conversations, "total": len(conversations)}


@router.get("/analytics/summary")
async def analytics_summary(
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    department: Optional[str] = None,
    db: DatabaseService = Depends(get_db),
):
    try:
        start = datetime.fromisoformat(startDate) if startDate else None
        end = datetime.fromisoformat(endDate) if endDate else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601 (e.g. 2024-01-01T00:00:00)")
    return await db.get_analytics_summary(start_date=start, end_date=end, department=department)
