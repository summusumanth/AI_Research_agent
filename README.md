# arXiv Curator — Agentic RAG

A production-style Retrieval-Augmented Generation system over arXiv CS/AI papers.
It ingests papers on a schedule, parses and chunks them, indexes them for hybrid
(keyword + semantic) search, and answers questions with a local LLM. An agentic
layer (LangGraph) adds query validation, document grading, query rewriting, and
adaptive retrieval, exposed over an API, a custom web chat UI, and a Telegram bot.

## Stack

- FastAPI — REST API
- PostgreSQL 16 — paper metadata and content
- OpenSearch 2.19 — hybrid search (BM25 + vectors)
- Apache Airflow 3.0 — ingestion orchestration
- Ollama — local LLM serving
- Jina AI — embeddings
- Redis — response caching
- Langfuse — tracing / observability
- HTML / CSS / JavaScript — web chat UI (served by FastAPI)
- LangGraph — agentic workflow
- Telegram — mobile access

## Prerequisites

- Docker Desktop (with Docker Compose)
- Python 3.12+
- UV package manager — https://docs.astral.sh/uv/getting-started/installation/
- 8GB+ RAM, 20GB+ free disk

## Setup

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env. Key variables:
#   JINA_API_KEY                          required for embeddings / hybrid search
#   TELEGRAM__BOT_TOKEN                    required only for the Telegram bot
#   LANGFUSE__PUBLIC_KEY / __SECRET_KEY    optional, for monitoring

# 2. Install dependencies
uv sync

# 3. Start all services
docker compose up --build -d

# 4. Verify
curl http://localhost:8000/api/v1/health
```

The web chat UI is served by the API itself — once services are up, open:

```
http://localhost:8000/
```

## Web UI

The chat interface is a static HTML/CSS/JS app in `frontend/`, served directly by
FastAPI:

- `frontend/index.html` — markup
- `frontend/styles.css`  — light theme, modern chat layout
- `frontend/app.js`      — chat logic and API calls

It is mounted at the site root (`/`) with assets under `/static`. The UI supports
three modes, switchable from the sidebar:

| Mode      | Endpoint                  | Behaviour                          |
|-----------|---------------------------|------------------------------------|
| RAG Ask   | `/api/v1/stream`          | Token-by-token streaming answers   |
| Hybrid    | `/api/v1/hybrid-search/`  | Ranked paper search results        |
| Agentic   | `/api/v1/ask-agentic`     | Adaptive retrieval + reasoning steps |

Conversations are kept in the browser via local storage. To point the UI at a
different API origin, set `window.ARXIV_API_BASE` before `app.js` loads.

## Services

| Service              | URL                          | Purpose                       |
|----------------------|------------------------------|-------------------------------|
| Web UI               | http://localhost:8000/       | Chat interface                |
| API docs             | http://localhost:8000/docs   | Interactive API explorer      |
| Langfuse             | http://localhost:3000        | Tracing dashboard             |
| Airflow              | http://localhost:8080        | Ingestion workflow management |
| OpenSearch Dashboards| http://localhost:5601        | Search engine UI              |

Airflow credentials are generated at
`airflow/simple_auth_manager_passwords.json.generated` on first run.

## Key API endpoints

| Endpoint                 | Method | Description                          |
|--------------------------|--------|--------------------------------------|
| `/api/v1/health`         | GET    | Service health check                 |
| `/api/v1/hybrid-search/` | POST   | Hybrid search (BM25 + vectors)       |
| `/api/v1/ask`            | POST   | RAG question answering               |
| `/api/v1/stream`         | POST   | Streaming RAG responses              |
| `/api/v1/ask-agentic`    | POST   | Agentic RAG with adaptive retrieval  |
| `/api/v1/feedback`       | POST   | Submit feedback on an answer         |

## Ingestion

The daily pipeline lives in `airflow/dags/arxiv_paper_ingestion.py` and runs
weekday mornings: setup → fetch papers → chunk, embed & hybrid-index → report →
cleanup. Trigger it manually from the Airflow UI to ingest immediately.

## Common commands

```bash
make start     # start all services
make health    # check service health
make logs      # tail logs
make stop      # stop services
make format    # format code
make lint      # lint + type check
make clean     # tear everything down
```

## Project layout

```
frontend/       web chat UI (index.html, styles.css, app.js)
src/
  routers/      API endpoints (hybrid_search, ask/stream, agentic_ask, ping)
  services/     business logic (arxiv, pdf_parser, indexing, embeddings,
                opensearch, ollama, cache, langfuse, telegram, agents)
  models/       SQLAlchemy models
  repositories/ data access
  schemas/      Pydantic request/response models
  db/           database abstraction + PostgreSQL implementation
  config.py     environment configuration
  main.py       FastAPI app + lifespan wiring + UI serving
airflow/        ingestion DAGs and runtime
compose.yml     service orchestration
```

The agentic workflow is in `src/services/agents/`: `agentic_rag.py` builds the
LangGraph graph, `state.py` holds the shared state, and `nodes/` contains the
guardrail, retrieve, grade, rewrite, and generate nodes.

## License

MIT — Copyright (c) 2025 Sumanth Mandavalli. See LICENSE.
