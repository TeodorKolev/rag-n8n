"""
Redis cache service
"""

import json
import logging
from typing import Any, Optional

import redis.asyncio as aioredis

from config import settings

logger = logging.getLogger(__name__)

_client: Optional[aioredis.Redis] = None


async def get_client() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _client


async def close():
    global _client
    if _client:
        await _client.aclose()
        _client = None


async def get(key: str) -> Optional[Any]:
    try:
        client = await get_client()
        value = await client.get(key)
        if value is None:
            return None
        return json.loads(value)
    except Exception as e:
        logger.warning(f"Cache get failed for key {key}: {e}")
        return None


async def set(key: str, value: Any, ttl: int = 300) -> bool:
    try:
        client = await get_client()
        await client.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception as e:
        logger.warning(f"Cache set failed for key {key}: {e}")
        return False


async def delete(key: str) -> bool:
    try:
        client = await get_client()
        await client.delete(key)
        return True
    except Exception as e:
        logger.warning(f"Cache delete failed for key {key}: {e}")
        return False
