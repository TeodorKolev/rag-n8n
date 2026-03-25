# RAG Assistant with Claude Sonnet + Pinecone

An enterprise knowledge management system that lets teams query internal documents through a chat interface. Upload PDFs, Word docs, and text files — the system processes them into searchable embeddings and uses Claude Sonnet to generate accurate, source-cited answers.

Built for multi-department use (Finance, Care, Sales, HR) with department-level access filtering so each team only retrieves documents relevant to them.

## How it works

1. **Ingest** — Upload documents via the UI or API. A Python microservice extracts text, splits it into chunks, generates embeddings, and stores them in Pinecone.
2. **Query** — Submit a question via the chat interface. n8n orchestrates the RAG pipeline: embed the query → search Pinecone for relevant chunks → pass context to Claude Sonnet → return an answer with source citations.
3. **Iterate** — Users can rate responses. Feedback and conversation history are stored for analytics and quality tracking.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Material-UI |
| Backend API | Node.js, Express, PostgreSQL, Redis |
| Document processing | Python, FastAPI |
| Vector database | Pinecone |
| LLM | Claude Sonnet (Anthropic) |
| Embeddings | OpenAI `text-embedding-ada-002` |
| Workflow orchestration | n8n |
| Infrastructure | Docker Compose |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in: PINECONE_API_KEY, CLAUDE_API_KEY, OPENAI_API_KEY,
#          POSTGRES_USER, POSTGRES_PASSWORD, JWT_SECRET, PYTHON_SERVICE_API_KEY
# Generate secrets: openssl rand -hex 64

# 3. Start all services
docker-compose up -d
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| n8n | http://localhost:5678 |
| Python service | http://localhost:8001 |

See [CLAUDE.md](CLAUDE.md) for development commands and architecture details.

## Project structure

```
backend/           Node.js API (auth, conversations, document routes)
frontend/          React chat interface
python-services/   Document processing microservice (FastAPI)
n8n-workflows/     RAG pipeline and document processing workflow templates
docs/              API documentation
docker-compose.yml Full local stack
.env.example       Environment variable template
```

## API documentation

See `docs/api.md` for endpoint reference.
