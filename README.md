# RAG Assistant with Claude Sonnet + Pinecone

An enterprise knowledge management system that lets teams query internal documents through a chat interface. Upload PDFs, Word docs, and text files — the system processes them into searchable embeddings and uses Claude Sonnet to generate accurate, source-cited answers.

Built for multi-department use (Finance, Care, Sales, HR) with department-level access filtering so each team only retrieves documents relevant to them.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Docker Network                             │
│                                                                     │
│  ┌──────────────┐     ┌──────────────────────────────────────────┐  │
│  │   Frontend   │────▶│          Python FastAPI :8001            │  │
│  │  React :3000 │     │  auth · conversations · documents · admin│  │
│  └──────────────┘     └───────┬──────────────────────┬───────────┘  │
│                               │                      │              │
│                    ┌──────────▼────────┐   ┌─────────▼──────────┐  │
│                    │   n8n  :5678      │   │  PostgreSQL :5433   │  │
│                    │  RAG pipeline     │   │  Redis      :6380   │  │
│                    └──────────┬────────┘   └────────────────────┘  │
│                               │                                     │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                  │
              ▼                 ▼                  ▼
        ┌──────────┐    ┌──────────────┐   ┌─────────────┐
        │ Pinecone │    │ Claude Sonnet│   │  OpenAI API │
        │ (vectors)│    │    (LLM)     │   │ (embeddings)│
        └──────────┘    └──────────────┘   └─────────────┘
```

### Document ingestion flow

```
User uploads file
      │
      ▼
FastAPI /documents/upload
      │  saves file + creates DB record (status: pending)
      ▼
Background worker (local) / SQS Lambda (production)
      │
      ├─ extract text
      ├─ chunk (1000 chars, 200 overlap)
      ├─ embed via OpenAI text-embedding-ada-002
      └─ upsert vectors to Pinecone  ──▶  status: completed
```

### Query flow

```
User sends question
      │
      ▼
FastAPI /conversations/query
      │  checks Redis cache
      ▼
n8n webhook
      │
      ├─ embed question (OpenAI)
      ├─ search Pinecone (vector + department filter)
      ├─ build prompt with retrieved chunks
      └─ call Claude Sonnet
            │
            ▼
      answer + source citations
            │
      stored in PostgreSQL + cached in Redis (5 min TTL)
            │
            ▼
      returned to user
```

## How it works

1. **Ingest** — Upload documents via the UI or API. The Python FastAPI service saves the file, creates a DB record, and either enqueues an SQS job (production) or processes it in the background (local dev). Text is extracted, split into chunks, embedded, and stored in Pinecone.
2. **Query** — Submit a question via the chat interface. n8n orchestrates the RAG pipeline: embed the query → search Pinecone for relevant chunks → pass context to Claude Sonnet → return an answer with source citations.
3. **Iterate** — Users can rate responses. Feedback and conversation history are stored for analytics and quality tracking.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Material-UI |
| Backend API | Python, FastAPI, PostgreSQL, Redis |
| Document processing | Python, FastAPI, SQS worker (production) |
| Vector database | Pinecone |
| LLM | Claude Sonnet (Anthropic) |
| Embeddings | OpenAI `text-embedding-ada-002` |
| Workflow orchestration | n8n |
| Infrastructure | Docker Compose / AWS Lambda (production) |

## Quick start

```bash
# 1. Configure environment
cp .env.example .env
# Fill in: PINECONE_API_KEY, CLAUDE_API_KEY, OPENAI_API_KEY,
#          POSTGRES_USER, POSTGRES_PASSWORD, JWT_SECRET,
#          PYTHON_SERVICE_API_KEY, N8N_BASIC_AUTH_USER, N8N_BASIC_AUTH_PASSWORD
# Generate secrets: openssl rand -hex 64

# 2. Start all services
docker-compose up -d
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API + Docs | http://localhost:8001 / http://localhost:8001/docs |
| n8n | http://localhost:5678 |

Default login: `admin@company.com` / `admin123`

See [CLAUDE.md](CLAUDE.md) for architecture details and per-service development commands.

## Importing n8n workflows

After starting the stack, import the workflows into n8n:

1. Open http://localhost:5678 and log in
2. Go to **Workflows** → **Add workflow**
3. Click the menu (⋮) → **Import from file**
4. Import each file from the `n8n-workflows/` folder:
   - `rag-assistant.json` — RAG query pipeline
   - `document-processing.json` — document ingestion pipeline
5. Activate each workflow using the toggle in the top-right corner

## Project structure

```
frontend/          React chat interface
python-services/   FastAPI backend (auth, conversations, documents, embeddings)
  routers/         API route handlers (auth, conversations, admin)
  services/        Business logic (database, n8n, cache, S3, SQS, Pinecone)
  middleware/       JWT auth dependencies
  worker/          AWS Lambda SQS worker for document processing
  db/              PostgreSQL schema (init.sql)
n8n-workflows/     RAG pipeline workflow templates
docker-compose.yml Full local stack
.env.example       Environment variable template
```

## API documentation

Interactive docs available at http://localhost:8001/docs when the stack is running.
