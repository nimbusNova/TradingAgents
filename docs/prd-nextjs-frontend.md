# PRD: TradingAgents Web Frontend (Next.js)

**Status:** Decisions locked — ready for implementation  
**Author:** nimbusnova  
**Date:** 2026-04-25

---

## 1. Problem Statement

TradingAgents currently runs entirely in the terminal. Users must be comfortable with CLI tooling, Python environments, and manual `.env` configuration. This creates friction for non-technical stakeholders, limits sharing of results, and makes the product hard to demo or evaluate.

The goal is to deliver the full five-phase analysis workflow through a web UI built with Next.js — same intelligence, no terminal required.

---

## 2. Goals

- Let any user run a complete trading analysis (Analyst → Research → Trader → Risk → Portfolio Manager) from a browser
- Stream agent progress and partial reports in real time, mirroring the rich terminal experience
- Persist results so users can revisit and share past analyses
- Support all existing LLM providers and configuration options through a guided setup wizard
- Ship as a self-hostable app (Docker) with no mandatory cloud dependency

### Non-goals (v1)

- User authentication / multi-tenant — single-user, no login required
- Mobile-native app
- Automated scheduled runs / cron-based trading
- Brokerage integration or live order execution
- API key management UI — keys live in `.env` on the server only

---

## 3. User Stories

| # | As a… | I want to… | So that… |
|---|--------|------------|----------|
| 1 | Analyst | Start a new analysis by entering a ticker and date in a form | I don't need to install Python |
| 2 | Analyst | Watch each agent's status update live as the run progresses | I know the system is working and can follow reasoning |
| 3 | Analyst | Read each report section (market, sentiment, news, fundamentals, debate, final decision) as it's produced | I don't have to wait for the full run to finish |
| 4 | Manager | Review a saved analysis report with all five phases in a clean layout | I can share a link with my team |
| 5 | Power user | Choose LLM provider, models, research depth, and output language before each run | I can tune cost vs. quality |
| 6 | Developer | Self-host the full stack with `docker compose up` | I keep my API keys and data on-prem |

---

## 4. Architecture Overview

```
Browser (Next.js)
      │  HTTP + Server-Sent Events (SSE)
      ▼
FastAPI Backend  ──── TradingAgentsGraph (existing Python package)
      │
      ├── SQLite  (run history, agent status, report sections)
      └── File system  (~/.tradingagents/memory, cache, logs)
```

### Why SSE over WebSockets

The analysis is a one-way stream of events from server to browser. SSE is simpler, works through standard HTTP/2, and is natively supported by Next.js route handlers and the `EventSource` browser API. WebSockets add bidirectional complexity that isn't needed.

### Why FastAPI

The existing Python package (`tradingagents`) must stay in Python. FastAPI adds minimal overhead, has first-class async/streaming support, and generates an OpenAPI spec the Next.js client can consume.

---

## 5. Components

### 5.1 FastAPI Backend (`/backend`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/runs` | POST | Enqueue a new analysis run; returns `run_id` and `position` in queue |
| `/api/runs/{run_id}/stream` | GET (SSE) | Stream agent events for a run (also emits `queued` event while waiting) |
| `/api/runs/{run_id}` | GET | Fetch complete state of a finished run |
| `/api/runs` | GET | List past runs (paginated) |
| `/api/providers` | GET | Return supported providers + model catalog |
| `/api/memory` | GET | Return parsed memory log entries (ticker, date, decision, outcome, reflection) |
| `/api/health` | GET | Liveness probe |

#### Run Queue

Runs are serialized through a single asyncio queue — only one `TradingAgentsGraph` executes at a time. When a run is enqueued while another is active the SSE stream immediately emits a `queued` event so the UI can show a "Waiting in queue..." state. This matches the Python graph's single-threaded nature and avoids race conditions on shared file-system state (memory log, cache).

#### SSE Event Schema

```jsonc
// Agent status change
{ "type": "agent_status", "agent": "Market Analyst", "status": "in_progress" }

// New report section content
{ "type": "report_section", "section": "market_report", "content": "## Market Analysis\n..." }

// Tool call
{ "type": "tool_call", "tool": "get_stock_data", "args": { "ticker": "NVDA" } }

// LLM message
{ "type": "message", "role": "agent", "content": "Based on RSI at 72..." }

// Queued (emitted immediately if another run is active)
{ "type": "queued", "position": 1 }

// Run complete
{ "type": "done", "decision": "BUY", "summary": "Strong momentum..." }

// Error
{ "type": "error", "message": "..." }
```

#### Run Request Body

```jsonc
{
  "ticker": "NVDA",
  "analysis_date": "2026-04-25",
  "analysts": ["market", "social", "news", "fundamentals"],
  "research_depth": 1,           // 1 = shallow, 3 = medium, 5 = deep
  "llm_provider": "openai",
  "quick_think_llm": "gpt-4.1-mini",
  "deep_think_llm": "gpt-4.1",
  "output_language": "English",
  "openai_reasoning_effort": "medium",   // provider-specific, optional
  "google_thinking_level": null,
  "anthropic_effort": null,
  "checkpoint_enabled": false
}
```

### 5.2 Next.js Frontend (`/frontend`)

#### Pages & Routes

| Route | Description |
|-------|-------------|
| `/` | Home — recent runs list + "New Analysis" CTA |
| `/run/new` | Multi-step setup wizard |
| `/run/[id]` | Live analysis view (streams during run, static after) |
| `/run/[id]/report` | Full report view (printable) |
| `/memory` | Memory log — past decisions with outcomes and reflections, filterable by ticker |

#### Key Components

**`RunWizard`** — Guided 6-step form matching the current CLI flow:
1. Ticker + Date
2. Analysts selection (checkbox group)
3. Research depth (radio)
4. LLM Provider (card select)
5. Model selection (quick + deep thinkers)
6. Provider-specific options (conditionally rendered)

**`LiveAnalysisView`** — Consumes the SSE stream and renders:
- `AgentProgressPanel` — table of all agents with status badges (pending / in-progress / done)
- `EventFeed` — scrolling list of tool calls and messages, newest at top
- `ReportPanel` — live-updating markdown for the current report section
- `StatsBar` — LLM calls, tool calls, token usage, elapsed time

**`ReportView`** — Full five-section report in an accordion layout:
- I. Analyst Team Reports (four sub-sections)
- II. Research Team Decision (bull history, bear history, manager decision)
- III. Trading Team Plan
- IV. Risk Management
- V. Portfolio Manager Decision (prominently styled final rating)

**`FinalDecisionBadge`** — Color-coded pill: BUY (green) / OVERWEIGHT / HOLD (yellow) / UNDERWEIGHT / SELL (red)

**`RunHistory`** — Table on homepage: Ticker, Date, Decision, Provider, Created At

**`MemoryLogView`** (`/memory`) — Timeline of past decisions and their resolved outcomes:
- Filterable by ticker
- Each entry shows: ticker, date, decision badge, raw return %, alpha vs SPY, and the 2-4 sentence reflection generated by the Reflector
- Pending entries (not yet resolved) shown with a "Pending outcome" label
- Links back to the original run report

---

## 6. Data Model

```sql
-- Runs table (SQLite)
CREATE TABLE runs (
  id          TEXT PRIMARY KEY,   -- uuid
  ticker      TEXT NOT NULL,
  trade_date  TEXT NOT NULL,
  config      JSON NOT NULL,      -- full RunRequest stored as JSON
  status      TEXT NOT NULL,      -- pending | running | done | error
  decision    TEXT,               -- BUY | OVERWEIGHT | HOLD | UNDERWEIGHT | SELL
  created_at  TEXT NOT NULL,
  finished_at TEXT
);

-- Report sections (updated incrementally as SSE events arrive)
CREATE TABLE report_sections (
  run_id   TEXT NOT NULL REFERENCES runs(id),
  section  TEXT NOT NULL,         -- market_report | sentiment_report | etc.
  content  TEXT,
  PRIMARY KEY (run_id, section)
);

-- Agent status log
CREATE TABLE agent_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id    TEXT NOT NULL REFERENCES runs(id),
  agent     TEXT NOT NULL,
  status    TEXT NOT NULL,
  ts        TEXT NOT NULL
);
```

---

## 7. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend framework | Next.js 15 (App Router) | SSE-friendly, RSC for static report pages, easy deployment |
| Styling | Tailwind CSS + shadcn/ui | Fast to build, accessible components, consistent design |
| State / SSE | Native `EventSource` + React `useState` | No extra dependencies needed for SSE |
| Charts (optional v2) | Recharts | Lightweight, composable |
| Backend | FastAPI + Uvicorn | Async streaming, OpenAPI spec auto-gen |
| Database | SQLite via `aiosqlite` | Zero-config, self-hostable, adequate for single-user / small team |
| Containerization | Docker Compose | Single `docker compose up` for full stack |
| Markdown rendering | `react-markdown` + `remark-gfm` | Agents output GFM markdown |

---

## 8. UI Flow

```
Homepage (/) 
  └── "New Analysis" button
        └── RunWizard (/run/new)
              ├── Step 1: Ticker + Date
              ├── Step 2: Analysts
              ├── Step 3: Research Depth
              ├── Step 4: Provider
              ├── Step 5: Models
              └── Step 6: Confirm → POST /api/runs → redirect to /run/[id]

/run/[id] (live during run)
  ├── AgentProgressPanel  (SSE: agent_status events)
  ├── EventFeed           (SSE: tool_call + message events)
  ├── ReportPanel         (SSE: report_section events)
  └── StatsBar            (SSE: all events aggregated)

/run/[id] (after run completes)
  └── Static view identical to live view, loaded from DB via GET /api/runs/{id}

/run/[id]/report
  └── Printable full report, all five sections expanded
```

---

## 9. Milestones

| Milestone | Scope | Estimate |
|-----------|-------|----------|
| M1 — Backend scaffold | FastAPI app, `/api/runs` POST + SSE stream, wraps existing `TradingAgentsGraph` | 3 days |
| M2 — Frontend scaffold | Next.js app, `RunWizard`, basic `LiveAnalysisView` consuming SSE | 3 days |
| M3 — Report & history | `ReportView`, `RunHistory`, SQLite persistence, GET endpoints | 2 days |
| M4 — Polish | `FinalDecisionBadge`, responsive layout, loading/error states, Tailwind pass | 2 days |
| M5 — Docker | `Dockerfile` for each service, `docker-compose.yml`, `.env.example` | 1 day |
| M6 — QA | End-to-end test with 3 providers, mobile layout check, error path testing | 2 days |

**Total estimated: ~2 weeks for a working v1**

---

## 10. Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Auth | **No auth.** Single-user, no login. No NextAuth in v1. |
| 2 | Concurrent runs | **Single queue.** One run at a time via asyncio queue; UI shows "Waiting in queue…" state. |
| 3 | API key handling | **Server `.env` only.** Keys never pass through the browser or get stored in the DB. |
| 4 | Memory log UI | **Visible in UI.** `/memory` page shows all past decisions, outcomes, and reflections with ticker filtering. |
| 5 | Deployment | **Self-hosted Docker only.** `docker compose up` brings up frontend + backend. No Vercel/Railway. |
