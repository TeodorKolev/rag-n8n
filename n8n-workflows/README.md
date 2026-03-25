# n8n Workflow Templates for RAG Assistant

This directory contains pre-configured n8n workflows for the RAG Assistant system.

## Available Workflows

### 1. RAG Assistant Workflow (`rag-assistant-workflow.json`)

**Purpose**: Main query processing workflow that handles user questions and generates responses using Claude Sonnet + Pinecone.

**Flow**:
1. **Webhook Trigger** - Receives user queries via HTTP POST
2. **Preprocess Query** - Validates and cleans the user input
3. **Generate Query Embedding** - Creates embedding using OpenAI API
4. **Search Pinecone** - Finds relevant document chunks
5. **Prepare Claude Prompt** - Constructs context-aware prompt
6. **Call Claude Sonnet** - Generates response using Claude API
7. **Format Response** - Structures the final answer
8. **Log Conversation** - Records the interaction for analytics
9. **Respond** - Returns the answer to the user

**Webhook URL**: `http://localhost:5678/webhook/rag-assistant-query`

**Request Format**:
```json
{
  "query": "How do I process a refund?",
  "department": "finance",
  "userId": "user123",
  "sessionId": "session456"
}
```

**Response Format**:
```json
{
  "answer": "To process a refund...",
  "query": "How do I process a refund?",
  "sources": [
    {
      "title": "Refund Policy",
      "source": "finance_manual.pdf",
      "department": "finance",
      "score": 0.95
    }
  ],
  "metadata": {
    "requestId": "req_1234567890_abc123",
    "userId": "user123",
    "sessionId": "session456",
    "department": "finance",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "model": "claude-sonnet-4-20250514",
    "sourceCount": 1
  }
}
```

### 2. Document Processing Workflow (`document-processing-workflow.json`)

**Purpose**: Handles document upload, processing, and embedding generation.

**Flow**:
1. **Document Upload Trigger** - Receives document processing requests
2. **Prepare Processing** - Extracts document metadata
3. **Update Status to Processing** - Marks document as being processed
4. **Process Document** - Calls Python service for text extraction and embedding
5. **Check Processing Result** - Determines if processing succeeded
6. **Handle Success/Failure** - Formats appropriate response
7. **Notify Completion/Failure** - Updates backend with results
8. **Success/Failure Response** - Returns processing status

**Webhook URL**: `http://localhost:5678/webhook/document-processing`

**Request Format**:
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

## Setup Instructions

### 1. Import Workflows

1. Access n8n at `http://localhost:5678`
2. Login with credentials (admin/password)
3. Go to **Workflows** → **Import from file**
4. Upload each JSON file from this directory

### 2. Configure Environment Variables

Ensure these environment variables are set in your n8n instance:

```bash
CLAUDE_API_KEY=your_claude_api_key
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_api_key
```

### 3. Test Workflows

#### Test RAG Assistant:
```bash
curl -X POST http://localhost:5678/webhook/rag-assistant-query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is our return policy?",
    "department": "sales",
    "userId": "test_user"
  }'
```

#### Test Document Processing:
```bash
curl -X POST http://localhost:5678/webhook/document-processing \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "test_doc_123",
    "filePath": "/uploads/test_document.pdf",
    "metadata": {
      "title": "Test Document",
      "source": "test",
      "department": "general"
    }
  }'
```

## Workflow Customization

### Adding New Departments

To add support for new departments, modify the workflows:

1. Update the **Preprocess Query** node to validate department names
2. Add department-specific filtering in **Search Pinecone**
3. Customize prompts in **Prepare Claude Prompt** for department context

### Integrating with Slack

To receive queries from Slack:

1. Replace **Webhook Trigger** with **Slack Trigger**
2. Configure Slack app credentials
3. Update response formatting for Slack message format

### Adding Authentication

To add user authentication:

1. Add **HTTP Request** node after webhook trigger
2. Validate JWT tokens or API keys
3. Include user context in all subsequent nodes

## Monitoring and Debugging

### Execution History

- View workflow executions in n8n dashboard
- Check logs for failed executions
- Monitor response times and error rates

### Common Issues

1. **API Rate Limits**: Add delay nodes between API calls
2. **Timeout Errors**: Increase timeout values in HTTP Request nodes
3. **Memory Issues**: Process documents in smaller batches

## Performance Optimization

### Caching

- Cache embeddings in Redis
- Store frequently accessed responses
- Implement query result caching

### Batch Processing

- Process multiple documents simultaneously
- Use batch embedding generation
- Implement queue-based processing

## Security Considerations

- Store API keys securely in n8n credentials
- Validate all input data
- Implement rate limiting
- Log security events

## Advanced Features

### A/B Testing

- Create multiple workflow versions
- Route traffic based on user segments
- Compare response quality metrics

### Multi-language Support

- Detect query language
- Use appropriate embedding models
- Translate responses if needed
