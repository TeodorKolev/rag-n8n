"""
n8n workflow integration service
"""

import logging
from typing import Any, Dict

import httpx

from config import settings

logger = logging.getLogger(__name__)


def _webhook_url() -> str:
    return f"{settings.n8n_protocol}://{settings.n8n_host}:{settings.n8n_port}/webhook/query"


async def process_query(
    query: str,
    department: str,
    user_id: str,
    session_id: str,
    conversation_id: str,
) -> Dict[str, Any]:
    """Send a RAG query to the n8n webhook and return the response."""
    url = _webhook_url()
    payload = {
        "query": query,
        "department": department,
        "userId": user_id,
        "sessionId": session_id,
        "conversationId": conversation_id,
    }

    logger.info(f"Calling n8n webhook: {url}", extra={"department": department, "conversation_id": conversation_id})

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            logger.info(f"n8n response received for conversation {conversation_id}")
            return data
        except httpx.HTTPStatusError as e:
            logger.error(f"n8n returned HTTP {e.response.status_code}: {e.response.text}")
            raise RuntimeError(f"n8n error {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            logger.error(f"n8n connection error: {e}")
            raise RuntimeError(f"Failed to reach n8n: {e}") from e
