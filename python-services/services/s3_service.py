"""
S3 service — file upload and download for document processing
"""

import logging
import os
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from config import settings

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client("s3", region_name=settings.aws_region)
    return _client


async def upload_file(file_bytes: bytes, s3_key: str, content_type: str = "application/octet-stream") -> str:
    """Upload file bytes to S3 and return the S3 key."""
    try:
        _get_client().put_object(
            Bucket=settings.s3_bucket,
            Key=s3_key,
            Body=file_bytes,
            ContentType=content_type,
        )
        logger.info(f"Uploaded {len(file_bytes)} bytes to s3://{settings.s3_bucket}/{s3_key}")
        return s3_key
    except ClientError as e:
        logger.error(f"S3 upload failed for {s3_key}: {e}")
        raise


def download_file(s3_key: str, local_path: str) -> str:
    """Download a file from S3 to a local path. Returns local_path."""
    try:
        _get_client().download_file(settings.s3_bucket, s3_key, local_path)
        logger.info(f"Downloaded s3://{settings.s3_bucket}/{s3_key} to {local_path}")
        return local_path
    except ClientError as e:
        logger.error(f"S3 download failed for {s3_key}: {e}")
        raise


def generate_presigned_upload_url(s3_key: str, expires_in: int = 3600) -> str:
    """Return a pre-signed PUT URL so the frontend can upload directly to S3."""
    try:
        url = _get_client().generate_presigned_url(
            "put_object",
            Params={"Bucket": settings.s3_bucket, "Key": s3_key},
            ExpiresIn=expires_in,
        )
        return url
    except ClientError as e:
        logger.error(f"Failed to generate presigned URL for {s3_key}: {e}")
        raise
