# n8n Workflows

Two workflows orchestrate the RAG pipeline.

## Workflows

### RAG Assistant (`rag-assistant.json`)

Handles user queries end-to-end: validates input → generates embedding → searches Pinecone → calls Claude Sonnet → returns response.

Called by the Python FastAPI backend at `POST /api/conversations/query`.

**Webhook URL**: `http://n8n:5678/webhook/query` (internal Docker network)
**External URL**: `http://localhost:5678/webhook/query`

**Request**:
```json
{
  "query": "How do I process a refund?",
  "department": "finance",
  "userId": "user123",
  "sessionId": "session456",
  "conversationId": "conv-uuid"
}
```

**Response**:
```json
{
  "answer": "To process a refund...",
  "sources": [
    {
      "title": "Refund Policy",
      "source": "finance_manual.pdf",
      "department": "finance",
      "score": 0.95
    }
  ],
  "metadata": {
    "model": "claude-sonnet-4-20250514",
    "sourceCount": 1,
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

---

### Document Processing (`document-processing.json`)

Receives a document processing request and forwards it to the Python service for text extraction, chunking, and embedding generation.

> **Note**: In production (serverless), document processing is handled directly by the SQS Lambda worker (`python-services/worker/handler.py`) and this workflow is not used.

**Webhook URL**: `http://localhost:5678/webhook/process-document`

**Request**:
```json
{
  "documentId": "doc_123",
  "filePath": "/uploads/document.pdf",
  "metadata": {
    "title": "Company Policy Manual",
    "source": "hr_department",
    "department": "hr",
    "filename": "policy_manual.pdf"
  }
}
```

---

## Setup

1. Access n8n at `http://localhost:5678`
2. Go to **Workflows** → **Import from file**
3. Upload `rag-assistant.json` and `document-processing.json`
4. Ensure `CLAUDE_API_KEY` is set in the n8n environment (used via `{{ $env.CLAUDE_API_KEY }}`)
5. Activate each workflow with the toggle in the top-right corner

## Test

```bash
# Test RAG Assistant
curl -X POST http://localhost:5678/webhook/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is our return policy?", "department": "sales", "userId": "test_user", "sessionId": "test", "conversationId": "test"}'

# Test Document Processing
curl -X POST http://localhost:5678/webhook/process-document \
  -H "Content-Type: application/json" \
  -d '{"documentId": "test_doc_123", "filePath": "/uploads/test.pdf", "metadata": {"title": "Test", "source": "test", "department": "general"}}'
```
