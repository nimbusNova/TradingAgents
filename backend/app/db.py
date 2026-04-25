from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path

import aiosqlite

DB_PATH = Path.home() / ".tradingagents" / "web.db"

_CREATE_RUNS = """
CREATE TABLE IF NOT EXISTS runs (
    id          TEXT PRIMARY KEY,
    ticker      TEXT NOT NULL,
    trade_date  TEXT NOT NULL,
    config      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    decision    TEXT,
    created_at  TEXT NOT NULL,
    finished_at TEXT
);
"""

_CREATE_SECTIONS = """
CREATE TABLE IF NOT EXISTS report_sections (
    run_id  TEXT NOT NULL,
    section TEXT NOT NULL,
    content TEXT,
    PRIMARY KEY (run_id, section)
);
"""

_CREATE_EVENTS = """
CREATE TABLE IF NOT EXISTS run_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id     TEXT NOT NULL,
    event_json TEXT NOT NULL,
    ts         TEXT NOT NULL
);
"""


async def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute(_CREATE_RUNS)
        await conn.execute(_CREATE_SECTIONS)
        await conn.execute(_CREATE_EVENTS)
        await conn.commit()


async def create_run(run_id: str, ticker: str, trade_date: str, config: dict) -> None:
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute(
            "INSERT INTO runs (id, ticker, trade_date, config, status, created_at) VALUES (?,?,?,?,?,?)",
            (run_id, ticker, trade_date, json.dumps(config), "pending", now),
        )
        await conn.commit()


async def update_run_status(
    run_id: str,
    status: str,
    decision: str | None = None,
    finished_at: str | None = None,
) -> None:
    async with aiosqlite.connect(DB_PATH) as conn:
        if decision is not None:
            await conn.execute(
                "UPDATE runs SET status=?, decision=?, finished_at=? WHERE id=?",
                (status, decision, finished_at or datetime.utcnow().isoformat(), run_id),
            )
        else:
            await conn.execute("UPDATE runs SET status=? WHERE id=?", (status, run_id))
        await conn.commit()


async def get_run(run_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute("SELECT * FROM runs WHERE id=?", (run_id,)) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def list_runs(limit: int = 100) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute(
            "SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)
        ) as cur:
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


async def upsert_section(run_id: str, section: str, content: str) -> None:
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute(
            "INSERT OR REPLACE INTO report_sections (run_id, section, content) VALUES (?,?,?)",
            (run_id, section, content),
        )
        await conn.commit()


async def get_sections(run_id: str) -> dict[str, str]:
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute(
            "SELECT section, content FROM report_sections WHERE run_id=?", (run_id,)
        ) as cur:
            rows = await cur.fetchall()
            return {r["section"]: r["content"] for r in rows}


async def save_events_batch(run_id: str, events: list[dict]) -> None:
    if not events:
        return
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.executemany(
            "INSERT INTO run_events (run_id, event_json, ts) VALUES (?,?,?)",
            [(run_id, json.dumps(e), now) for e in events],
        )
        await conn.commit()


async def get_events(run_id: str) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute(
            "SELECT event_json FROM run_events WHERE run_id=? ORDER BY id", (run_id,)
        ) as cur:
            rows = await cur.fetchall()
            return [json.loads(r["event_json"]) for r in rows]
