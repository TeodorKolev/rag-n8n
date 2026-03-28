"""
n8n workflow integration service
"""

import asyncio
import logging
from typing import Any, Dict

import httpx

from config import settings

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_BASE_BACKOFF = 1.0  # seconds; doubled on each retry


def _webhook_url() -> str:
    return f"{settings.n8n_protocol}://{settings.n8n_host}:{settings.n8n_port}/webhook/query"


async def process_query(
    query: str,
    department: str,
    user_id: str,
    session_id: str,
    conversation_id: str,
) -> Dict[str, Any]:
    """Send a RAG query to the n8n webhook and return the response.

    Retries up to _MAX_RETRIES times on connection errors or 5xx responses,
    with exponential backoff.  4xx errors are not retried (client fault).
    Internal n8n response bodies are never forwarded to callers to avoid
    leaking credentials or infrastructure details.
    """
    url = _webhook_url()
    payload = {
        "query": query,
        "department": department,
        "userId": user_id,
        "sessionId": session_id,
        "conversationId": conversation_id,
    }

    logger.info(
        "Calling n8n webhook",
        extra={"department": department, "conversation_id": conversation_id},
    )

    last_error: Exception = None

    for attempt in range(_MAX_RETRIES):
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                logger.info(f"n8n response received for conversation {conversation_id}")
                return data

            except httpx.HTTPStatusError as e:
                status_code = e.response.status_code
                # ── Fix #5: don't retry 4xx; log status only (no body) ────────
                if status_code < 500:
                    logger.error(f"n8n returned HTTP {status_code} (client error, not retrying)")
                    raise RuntimeError(f"n8n returned HTTP {status_code}") from e

                logger.warning(
                    f"n8n returned HTTP {status_code} (attempt {attempt + 1}/{_MAX_RETRIES})"
                )
                last_error = RuntimeError(f"n8n returned HTTP {status_code}")

            except httpx.RequestError as e:
                logger.warning(
                    f"n8n connection error (attempt {attempt + 1}/{_MAX_RETRIES}): {type(e).__name__}"
                )
                last_error = RuntimeError("Failed to reach n8n")

        if attempt < _MAX_RETRIES - 1:
            backoff = _BASE_BACKOFF * (2 ** attempt)
            logger.info(f"Retrying n8n in {backoff:.1f}s…")
            await asyncio.sleep(backoff)

    logger.error(f"n8n unavailable after {_MAX_RETRIES} attempts for conversation {conversation_id}")
    raise last_error
