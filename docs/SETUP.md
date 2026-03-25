# RAG Assistant Setup Guide

This guide will help you set up and run the RAG Assistant system locally or in production.

## Prerequisites

- **Node.js** 18+ and npm 9+
- **Python** 3.11+
- **Docker** and Docker Compose
- **PostgreSQL** 15+
- **Redis** 7+

## API Keys Required

Before starting, you'll need API keys from:

1. **Pinecone** - Vector database for embeddings
   - Sign up at [pinecone.io](https://pinecone.io)
   - Create a new index with 1536 dimensions (for OpenAI embeddings)

2. **Claude API** - Language model for responses
   - Get API key from [Anthropic](https://console.anthropic.com)

3. **OpenAI API** - For embeddings generation
   - Get API key from [OpenAI](https://platform.openai.com)

## Quick Start with Docker

### 1. Clone and Setup

```bash
git clone <repository>
cd pinecone
cp env.example .env
```

### 2. Configure Environment Variables

Edit `.env` file with your API keys:

```bash
# API Keys
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_ENVIRONMENT=your_pinecone_environment
PINECONE_INDEX_NAME=rag-assistant

CLAUDE_API_KEY=your_claude_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Database (use Docker defaults for local development)
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/rag_assistant
REDIS_URL=redis://redis:6379

# Authentication
JWT_SECRET=your-secure-jwt-secret-here
```

### 3. Start All Services

```bash
docker-compose up -d
```

This will start:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Python Service**: http://localhost:8001
- **n8n**: http://localhost:5678 (admin/password)
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### 4. Import n8n Workflows

1. Go to http://localhost:5678
2. Login with `admin` / `password`
3. Import workflow files from `n8n-workflows/` directory

### 5. Test the System

1. Open http://localhost:3000
2. Login with `admin@company.com` / `admin123`
3. Upload a test document
4. Start chatting!

## Manual Setup (Development)

### 1. Database Setup

```bash
# Start PostgreSQL and Redis
docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Initialize database
psql -h localhost -U postgres -d postgres -f backend/db/init.sql
```

### 2. Python Service

```bash
cd python-services
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Backend API

```bash
cd backend
npm install
npm run dev
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 5. n8n (Optional)

```bash
npx n8n start --tunnel
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PINECONE_API_KEY` | Pinecone API key | Required |
| `PINECONE_ENVIRONMENT` | Pinecone environment | Required |
| `PINECONE_INDEX_NAME` | Pinecone index name | `rag-assistant` |
| `CLAUDE_API_KEY` | Claude API key | Required |
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_URL` | Redis connection string | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Logging level | `info` |
| `MAX_FILE_SIZE` | Max upload file size | `100MB` |
| `MAX_CHUNK_SIZE` | Text chunk size for embeddings | `1000` |

### Pinecone Index Setup

1. Create a new index in Pinecone console:
   - **Name**: `rag-assistant` (or your custom name)
   - **Dimensions**: `1536` (for OpenAI ada-002 embeddings)
   - **Metric**: `cosine`
   - **Pod Type**: `p1.x1` (starter)

### Department Configuration

The system supports these departments by default:
- `finance` - Financial policies and procedures
- `care` - Customer care documentation
- `sales` - Sales processes and materials
- `hr` - Human resources policies
- `general` - General company information

## Usage

### 1. Document Upload

Upload documents through the web interface or API:

```bash
curl -X POST http://localhost:8001/documents/upload \
  -H "Content-Type: multipart/form-data" \
  -F "file=@document.pdf" \
  -F "title=Company Policy Manual" \
  -F "department=hr"
```

### 2. Query via API

```bash
curl -X POST http://localhost:8000/api/conversations/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "query": "What is our return policy?",
    "department": "sales"
  }'
```

### 3. n8n Workflow

Query via n8n webhook:

```bash
curl -X POST http://localhost:5678/webhook/rag-assistant-query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How do I process a refund?",
    "department": "finance",
    "userId": "user123"
  }'
```

## Monitoring

### Health Checks

- **Backend**: http://localhost:8000/health/detailed
- **Python Service**: http://localhost:8001/health
- **Frontend**: http://localhost:3000/health

### Metrics

- **System metrics**: http://localhost:8000/health/metrics
- **Database stats**: Available via admin panel

### Logs

- **Backend logs**: Console output or `logs/` directory in production
- **Python service logs**: Console output
- **n8n logs**: n8n interface > Executions

## Troubleshooting

### Common Issues

1. **"Pinecone index not found"**
   - Verify index name in environment variables
   - Check Pinecone console for index status

2. **"OpenAI API rate limit"**
   - Check your OpenAI usage limits
   - Consider upgrading your OpenAI plan

3. **"Database connection failed"**
   - Ensure PostgreSQL is running
   - Check database URL format

4. **"Redis connection failed"**
   - Ensure Redis is running
   - Check Redis URL format

5. **"Document processing stuck"**
   - Check Python service logs
   - Restart Python service: `docker-compose restart python-service`

### Debug Mode

Enable debug logging:

```bash
export LOG_LEVEL=debug
export NODE_ENV=development
```

### Reset Data

To reset all data (⚠️ **destructive**):

```bash
docker-compose down -v
docker-compose up -d
```

## Production Deployment

### Docker Swarm

```bash
docker stack deploy -c docker-compose.prod.yml rag-assistant
```

### Kubernetes

See `k8s/` directory for Kubernetes manifests.

### Environment Considerations

- Use strong JWT secrets
- Enable HTTPS/TLS
- Set up proper monitoring
- Configure backup strategies
- Use managed databases (RDS, Redis Cloud)
- Set up log aggregation

## Security

### Authentication

- JWT tokens with configurable expiration
- Role-based access control (RBAC)
- Department-based data isolation

### API Security

- Rate limiting enabled
- CORS properly configured
- Input validation on all endpoints
- SQL injection prevention

### File Upload Security

- File type validation
- Size limits enforced
- Virus scanning recommended

## Performance Tuning

### Database

- Connection pooling configured
- Indexes on frequently queried columns
- Regular VACUUM and ANALYZE

### Caching

- Redis caching for frequent queries
- Embedding caching to reduce API calls
- Response caching for duplicate queries

### Scaling

- Horizontal scaling supported
- Load balancing recommended
- Separate read replicas for analytics

## Support

For issues and questions:

1. Check this documentation
2. Review logs for error messages
3. Check GitHub issues
4. Contact support team

## License

See LICENSE file for details.
