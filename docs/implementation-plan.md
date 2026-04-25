# Implementation Plan: Next.js Web Frontend

**Status:** In progress  
**Date:** 2026-04-25

---

## Stack

| Layer | Choice |
|-------|--------|
| Backend | FastAPI + Uvicorn, port 8000 |
| Streaming | Server-Sent Events (SSE) via sse-starlette |
| Persistence | SQLite via aiosqlite at `~/.tradingagents/web.db` |
| Frontend | Next.js 15 App Router + TypeScript |
| Styling | Tailwind CSS |
| Markdown | react-markdown + remark-gfm |
| Container | Docker Compose (backend + frontend services) |

---

## File Tree

```
backend/
  app/
    main.py            # FastAPI app, CORS, lifespan
    models.py          # Pydantic request/response models
    db.py              # SQLite schema + queries
    run_queue.py       # asyncio queue, thread executor, AgentTracker
    routes/
      runs.py          # POST/GET /api/runs, GET /api/runs/{id}/stream
      providers.py     # GET /api/providers
      memory.py        # GET /api/memory
  requirements.txt
  Dockerfile

frontend/
  app/
    layout.tsx         # Root layout + nav
    globals.css
    page.tsx           # Home — run history
    run/new/page.tsx   # 6-step wizard
    run/[id]/page.tsx  # Live analysis view (SSE)
    run/[id]/report/   # Full printable report
    memory/page.tsx    # Memory log viewer
  components/
    Navigation.tsx
    RunWizard.tsx
    LiveAnalysisView.tsx
    AgentProgressPanel.tsx
    EventFeed.tsx
    ReportPanel.tsx
    ReportView.tsx
    FinalDecisionBadge.tsx
    RunHistory.tsx
    MemoryLogView.tsx
  lib/
    types.ts
    api.ts
  next.config.ts       # Rewrites /api/* → backend:8000
  Dockerfile

docker-compose.yml     # Updated: backend + frontend + shared volume
```

---

## Streaming Architecture

```
Browser EventSource('/api/runs/{id}/stream')
        │
        │  SSE  (text/event-stream)
        ▼
FastAPI /api/runs/{id}/stream
  ├── If run active: subscribes to in-memory asyncio.Queue per run_id
  └── If run done:  replays saved events from SQLite

Background asyncio Queue (one run at a time)
  └── Runs TradingAgentsGraph.graph.stream() in ThreadPoolExecutor
      │   (stream_mode="values", state chunk per node)
      └── AgentTracker diffs consecutive states → events
          └── loop.call_soon_threadsafe → per-run asyncio.Queue → SSE
```

---

## SSE Event Types

| type | fields |
|------|--------|
| `queued` | `position` |
| `agent_status` | `agent`, `status` (pending\|in_progress\|completed) |
| `report_section` | `section`, `content` |
| `tool_call` | `tool`, `args` |
| `stats` | `llm_calls`, `tool_calls`, `tokens_in`, `tokens_out` |
| `done` | `decision` |
| `error` | `message` |

---

## Milestones

1. **Backend** — FastAPI, queue, SSE, DB (~3 days)
2. **Frontend scaffold** — Wizard + LiveAnalysisView (~3 days)
3. **Report + History + Memory pages** (~2 days)
4. **Docker** — Compose, Dockerfiles, env wiring (~1 day)
