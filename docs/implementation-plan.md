# Implementation Plan: TradingAgents Web Frontend

**Status:** In progress  
**Updated:** 2026-04-25

---

## Overview

The project adds a Next.js 15 frontend + FastAPI backend to TradingAgents so users can run the full five-phase analysis from a browser. Both layers are substantially built; this plan documents current completion state, the remaining gaps, and the exact steps to reach a shippable v1.

---

## Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Backend | FastAPI + Uvicorn, port 8000 | Async, streaming-first |
| Streaming | SSE via `sse-starlette` | One-way server → browser |
| Persistence | SQLite via `aiosqlite` at `~/.tradingagents/web.db` | Zero-config, single-user |
| Frontend | Next.js 15 App Router + TypeScript | RSC for static pages, client components for SSE |
| Styling | Tailwind CSS 3.4 | No additional component library |
| Markdown | `react-markdown` + `remark-gfm` | Agents emit GFM markdown |
| Container | Docker Compose | `backend` + `frontend` services + shared volume |

---

## File Tree

```
backend/
  app/
    main.py            # FastAPI app, CORS, lifespan
    models.py          # Pydantic request/response models
    db.py              # SQLite schema + queries
    run_queue.py       # asyncio queue, ThreadPoolExecutor, AgentTracker
    routes/
      runs.py          # POST/GET /api/runs, GET /api/runs/{id}/stream, GET /api/runs/{id}
      providers.py     # GET /api/providers (model catalog)
      memory.py        # GET /api/memory
  requirements.txt
  Dockerfile

frontend/
  app/
    layout.tsx         # Root layout + nav
    globals.css
    page.tsx           # Home — recent runs list
    run/new/page.tsx   # 6-step setup wizard
    run/[id]/page.tsx  # Live analysis view (SSE)
    run/[id]/report/page.tsx  # Full printable report
    memory/page.tsx    # Memory log viewer
  components/
    Navigation.tsx
    RunWizard.tsx
    LiveAnalysisView.tsx
    AgentProgressPanel.tsx
    EventFeed.tsx
    ReportPanel.tsx
    StatsBar.tsx          # ← not yet written
    ReportView.tsx
    FinalDecisionBadge.tsx
    RunHistory.tsx
    MemoryLogView.tsx
    PrintButton.tsx
  lib/
    types.ts
    api.ts
  next.config.ts       # Rewrites /api/* → backend:8000
  Dockerfile

docker-compose.yml
.env.example
```

---

## Streaming Architecture

```
Browser  EventSource('/api/runs/{id}/stream')
              │  text/event-stream
              ▼
FastAPI  GET /api/runs/{id}/stream
  ├── run active  → subscribe to per-run asyncio.Queue (live events)
  └── run done    → replay saved rows from run_events table (SQLite)

Background asyncio Queue (one run at a time)
  └── _process_run() — pulls run_id, executes in ThreadPoolExecutor
        └── TradingAgentsGraph.graph.stream(init_state, stream_mode="values")
              └── AgentTracker.diff(prev_state, curr_state) → SSE events
                    └── loop.call_soon_threadsafe() → per-run asyncio.Queue → SSE
```

Key constraint: `TradingAgentsGraph` is synchronous (LangGraph). It runs in a `ThreadPoolExecutor` thread and pushes events back to the event loop via `call_soon_threadsafe`.

---

## SSE Event Schema

| `type` | Fields | When emitted |
|--------|--------|--------------|
| `queued` | `position: int` | Immediately when a run is enqueued behind another |
| `agent_status` | `agent: str`, `status: "pending"\|"in_progress"\|"completed"` | Each time an agent node changes state |
| `report_section` | `section: str`, `content: str` | When a report field first becomes non-empty |
| `tool_call` | `tool: str`, `args: dict` | Extracted from LangChain tool messages |
| `stats` | `llm_calls`, `tool_calls`, `tokens_in`, `tokens_out` | Incrementally from callbacks |
| `done` | `decision: str` | Graph completes; decision is BUY/OVERWEIGHT/HOLD/UNDERWEIGHT/SELL |
| `error` | `message: str` | Any unhandled exception in the run thread |

Report section keys: `market_report`, `sentiment_report`, `news_report`, `fundamentals_report`, `investment_plan`, `trader_investment_plan`, `final_trade_decision`.

---

## Current Completion State

### M1 — Backend ✅ (complete)

| File | Status | Notes |
|------|--------|-------|
| `app/main.py` | Done | CORS, lifespan, queue startup |
| `app/models.py` | Done | RunRequest, RunResponse, RunListItem, MemoryEntry |
| `app/db.py` | Done | runs, report_sections, run_events tables; async queries |
| `app/run_queue.py` | Done | asyncio queue, AgentTracker state diffing, ThreadPoolExecutor |
| `routes/runs.py` | Done | POST create, GET list, GET detail, GET SSE stream |
| `routes/providers.py` | Done | Model catalog from MODEL_OPTIONS |
| `routes/memory.py` | Done | Parses `~/.tradingagents/memory/trading_memory.md` |
| `requirements.txt` | Done | fastapi, uvicorn, aiosqlite, sse-starlette, python-dotenv |
| `Dockerfile` | Done | python:3.12-slim, installs tradingagents + backend deps |

### M2 — Frontend scaffold ✅ (mostly complete, one gap)

| File | Status | Notes |
|------|--------|-------|
| `app/layout.tsx` | Done | Root layout, Navigation |
| `app/page.tsx` | Done | Home, renders RunHistory |
| `app/run/new/page.tsx` | Done | Renders RunWizard |
| `app/run/[id]/page.tsx` | Done | LiveAnalysisView with SSE |
| `app/run/[id]/report/page.tsx` | Done | Full report, PrintButton |
| `app/memory/page.tsx` | Done | MemoryLogView |
| `components/Navigation.tsx` | Done | Top nav |
| `components/RunWizard.tsx` | Done | 6-step wizard, submits to POST /api/runs |
| `components/LiveAnalysisView.tsx` | Done | EventSource, updates agent/report state |
| `components/AgentProgressPanel.tsx` | Done | Status badges per agent |
| `components/EventFeed.tsx` | Done | Scrolling tool_call + message events |
| `components/ReportPanel.tsx` | Done | Live markdown sections |
| `components/StatsBar.tsx` | **Missing** | LLM calls, tool calls, elapsed time counter |
| `components/FinalDecisionBadge.tsx` | Done | Color-coded BUY/HOLD/SELL pill |
| `components/RunHistory.tsx` | Done | Table of past runs |
| `components/MemoryLogView.tsx` | Done | Memory entries with ticker filter |
| `components/PrintButton.tsx` | Done | window.print() trigger |
| `lib/types.ts` | Done | RunListItem, SseEvent, MemoryEntry, etc. |
| `lib/api.ts` | Done | Typed fetch wrappers |
| `next.config.ts` | Done | `/api/*` rewrite to `backend:8000` |

### M3 — Report + History + Memory ✅ (complete)

All data-persistence endpoints are working (SQLite). Report sections are stored incrementally as SSE events arrive. History and memory pages are built.

### M4 — Polish ⚠️ (one item remaining)

`StatsBar` is the only component called out in the PRD that hasn't been implemented. Everything else (responsive layout, decision badge, loading/error states) is present.

### M5 — Docker ✅ (complete)

`backend/Dockerfile`, `frontend/Dockerfile`, and `docker-compose.yml` are all in place. Services share a `tradingagents_data` volume for `~/.tradingagents`.

### M6 — QA ❌ (not started)

No end-to-end test pass has been done. See QA checklist below.

---

## Remaining Work

### 1. Add `StatsBar` component

**File to create:** `frontend/components/StatsBar.tsx`

Props it receives (from `LiveAnalysisView` state, driven by `stats` SSE events):

```ts
interface StatsBarProps {
  llmCalls: number;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  elapsedMs: number;   // derived from run start time, not from SSE
}
```

Render a horizontal bar with four counters and an elapsed timer. The timer increments client-side from the moment the SSE connection opens until a `done` or `error` event arrives.

Wire it into `LiveAnalysisView`:
- Start a `setInterval` on SSE open, clear it on `done`/`error`
- Pass accumulated `stats` event values as props
- Mount `StatsBar` below `AgentProgressPanel` and above `EventFeed`

### 2. Verify AgentTracker coverage

`run_queue.py::AgentTracker.diff()` must emit `agent_status` events for every agent node. Confirm it covers all ten agents:

- Analyst layer: `Market Analyst`, `Social Media Analyst`, `News Analyst`, `Fundamentals Analyst`
- Research layer: `Bull Researcher`, `Bear Researcher`, `Research Manager`
- Trader: `Trader`
- Risk layer: `Risk Manager` (aggregates three debaters)
- Portfolio: `Portfolio Manager`

Cross-check against the graph nodes in `tradingagents/graph/setup.py`. Any node name mismatch between `AgentTracker` and `setup.py` means that agent's status will never appear in the UI.

### 3. QA pass

Run through the checklist below before tagging v1.

---

## QA Checklist

### Setup

```bash
cp .env.example .env   # fill in at least OPENAI_API_KEY
docker compose up --build
```

Open `http://localhost:3000`.

### Golden path

- [ ] Home page loads with empty run history
- [ ] "New Analysis" button navigates to `/run/new`
- [ ] Wizard steps 1–6 complete without errors; provider card renders correctly for each provider
- [ ] Submitting with ticker `AAPL` and a recent weekday date creates a run and redirects to `/run/{id}`
- [ ] Agent progress panel shows all agents starting in `pending`; statuses update to `in_progress` then `completed` as the run proceeds
- [ ] `EventFeed` shows tool calls as they fire
- [ ] `ReportPanel` populates markdown sections in real time
- [ ] `StatsBar` counts increment and elapsed timer ticks
- [ ] `done` event sets `FinalDecisionBadge` to the correct decision color
- [ ] After run completes, refreshing `/run/{id}` restores the full state from SQLite (SSE replay path)
- [ ] `/run/{id}/report` renders all five sections in the accordion layout
- [ ] Home page shows the completed run in the history table
- [ ] `/memory` page shows the new decision entry after the run

### Queue behavior

- [ ] Submit two runs back-to-back; second run SSE immediately emits `queued` event and UI shows "Waiting in queue…"
- [ ] After first run completes, second run begins automatically

### Provider coverage (test at least 2)

- [ ] OpenAI — `gpt-4.1-mini` / `gpt-4.1`
- [ ] Anthropic — verify `effort` param passes through; check `claude-sonnet-4-6`
- [ ] Google — verify `thinking_level` renders in wizard step 6

### Error paths

- [ ] Invalid ticker (e.g. `ZZZZZ`) → backend emits `error` SSE event → UI shows error state, not spinner
- [ ] Backend unreachable → SSE connection fails → UI shows reconnect message, not blank screen
- [ ] Missing API key for chosen provider → backend emits `error` with readable message

### Responsive layout

- [ ] Wizard is usable on a 375px viewport
- [ ] `/run/{id}` three-column grid stacks to single column on mobile
- [ ] Report accordion is readable on mobile

### Print

- [ ] "Print" button on `/run/{id}/report` triggers print dialog; output is clean (no nav, no buttons)

---

## Deployment Notes

### Environment variables

All API keys live in `.env` on the host. The Docker Compose `backend` service loads them via `env_file: .env`. Keys never reach the frontend container or the browser.

```
# .env (copy from .env.example)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
ALPHA_VANTAGE_API_KEY=...   # required for market data
```

### Volume mount

Both `backend` and `tradingagents-cli` services mount the same named volume to `/root/.tradingagents`. This is how:
- The backend reads/writes `web.db`, `memory/trading_memory.md`, and `results/`
- The CLI reads the same memory log when run interactively

### Next.js API proxy

`next.config.ts` rewrites all `/api/*` requests to `http://backend:8000`. This means the frontend container never needs to know the backend's external host — Docker's internal DNS resolves `backend` automatically. In development (outside Docker), set `NEXT_PUBLIC_API_URL=http://localhost:8000` and update `lib/api.ts` to use it, or run the backend directly and rely on the Next.js dev server proxy.

### Starting the stack

```bash
docker compose up --build          # first run
docker compose up                  # subsequent runs
docker compose down -v             # tear down (removes volumes — wipes DB and memory)
```

Access at: `http://localhost:3000`  
Backend directly: `http://localhost:8000/docs` (OpenAPI UI)

---

## Implementation Order

1. **Write `StatsBar.tsx`** and wire it into `LiveAnalysisView` (~1 hour)
2. **Audit `AgentTracker`** against graph node names; fix any mismatches (~1 hour)
3. **Docker smoke test** — `docker compose up --build`, open browser, run golden path manually (~1 hour)
4. **QA pass** — work through full checklist above, file bugs for anything that fails
5. **Fix QA bugs** — iterate until checklist is clean
6. **Tag `v0.3.0`** on main

Total remaining estimate: **1 day of focused work** for StatsBar + audit + QA pass.
