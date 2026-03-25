# RAG Assistant with Claude Sonnet + Pinecone

A comprehensive Retrieval-Augmented Generation system for enterprise knowledge management, designed for Finance, Care, and Sales teams.

## Architecture Overview

- **Document Processing**: Python microservice for PDF ingestion, text chunking, and embedding generation
- **Vector Database**: Pinecone for storing and retrieving document embeddings
- **LLM Integration**: Claude Sonnet for generating contextual responses
- **Workflow Automation**: n8n for orchestrating the RAG pipeline
- **Frontend**: React chat interface with query history and feedback
- **Backend**: Node.js API with authentication and monitoring
- **Evaluation**: Built-in metrics for retrieval quality and answer faithfulness

## Project Structure

```
├── backend/                 # Node.js API server
├── frontend/               # React chat interface
├── python-services/        # Document processing microservices
├── n8n-workflows/         # Workflow templates
├── monitoring/            # Evaluation and metrics
├── docs/                  # Documentation and examples
└── docker-compose.yml     # Development environment
```

## Quick Start

1. Clone and setup:
```bash
git clone <repo>
cd pinecone
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Add your API keys for Pinecone, Claude, OpenAI
```

3. Start services:
```bash
docker-compose up -d
```

4. Access the application:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- n8n: http://localhost:5678

## Features

- ✅ Multi-format document ingestion (PDF, DOCX, TXT)
- ✅ Intelligent text chunking and embedding
- ✅ Semantic search with Pinecone
- ✅ Context-aware responses with Claude Sonnet
- ✅ Real-time chat interface
- ✅ Query history and user feedback
- ✅ Performance monitoring and evaluation
- ✅ Automated document re-processing
- ✅ Role-based access control

## API Documentation

See `docs/api.md` for detailed API documentation.

## Contributing

See `docs/contributing.md` for development guidelines.
