"""
SQS service — enqueue document processing jobs
"""

import json
import logging

import boto3
from botocore.exceptions import ClientError

from config import settings

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client("sqs", region_name=settings.aws_region)
    return _client


def enqueue_document(document_id: str, s3_key: str, metadata: dict) -> str:
    """Send a document processing job to SQS. Returns the SQS message ID."""
    message = {
        "document_id": document_id,
        "s3_key": s3_key,
        "metadata": metadata,
    }
    try:
        response = _get_client().send_message(
            QueueUrl=settings.sqs_queue_url,
            MessageBody=json.dumps(message),
            MessageAttributes={
                "document_id": {"DataType": "String", "StringValue": document_id}
            },
        )
        message_id = response["MessageId"]
        logger.info(f"Enqueued document {document_id} → SQS message {message_id}")
        return message_id
    except ClientError as e:
        logger.error(f"SQS enqueue failed for document {document_id}: {e}")
        raise
