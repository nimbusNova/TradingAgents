"""Supabase Postgres backend (USE_ACTUAL_DB=true)."""
from __future__ import annotations
import json
import os
from datetime import datetime
from typing import Optional

import asyncpg
from supabase import create_client, Client

_pool: Optional[asyncpg.Pool] = None

def _admin_client() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SECRET_KEY"],
    )


async def init_db() -> None:
    global _pool
    _pool = await asyncpg.create_pool(os.environ["DATABASE_URL"], min_size=2, max_size=10)


async def _pool_acquire():
    assert _pool is not None, "DB pool not initialised — call init_db() first"
    return _pool.acquire()


# ── runs ────────────────────────────────────────────────────────────────────

async def create_run(
    run_id: str,
    ticker: str,
    trade_date: str,
    config: dict,
    user_id: str = "",
) -> None:
    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO runs (id, user_id, ticker, trade_date, config, status, llm_provider, created_at)
            VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
            """,
            run_id,
            user_id or None,
            ticker,
            datetime.fromisoformat(trade_date).date() if isinstance(trade_date, str) else trade_date,
            json.dumps(config),
            config.get("llm_provider"),
            datetime.utcnow(),
        )


async def update_run_status(
    run_id: str,
    status: str,
    decision: str | None = None,
    finished_at: str | None = None,
) -> None:
    async with _pool.acquire() as conn:
        if decision is not None:
            await conn.execute(
                "UPDATE runs SET status=$1, decision=$2, finished_at=$3 WHERE id=$4",
                status,
                decision,
                datetime.fromisoformat(finished_at) if finished_at else datetime.utcnow(),
                run_id,
            )
        else:
            await conn.execute("UPDATE runs SET status=$1 WHERE id=$2", status, run_id)


async def get_run(run_id: str) -> dict | None:
    async with _pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM runs WHERE id=$1", run_id)
        if not row:
            return None
        d = dict(row)
        # Stringify UUIDs and dates — asyncpg returns them as native Python objects
        for k in ("id", "user_id", "cache_source_run_id", "trade_date", "created_at", "finished_at"):
            if d.get(k) is not None:
                d[k] = str(d[k])
        return d


async def list_runs(user_id: str = "", limit: int = 100) -> list[dict]:
    async with _pool.acquire() as conn:
        if user_id:
            rows = await conn.fetch(
                "SELECT * FROM runs WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
                user_id, limit,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM runs ORDER BY created_at DESC LIMIT $1", limit
            )
        result = []
        for row in rows:
            d = dict(row)
            for k in ("trade_date", "created_at", "finished_at"):
                if d.get(k) is not None:
                    d[k] = str(d[k])
            result.append(d)
        return result


# ── sections ─────────────────────────────────────────────────────────────────

async def upsert_section(run_id: str, section: str, content: str) -> None:
    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO report_sections (run_id, section, content)
            VALUES ($1, $2, $3)
            ON CONFLICT (run_id, section) DO UPDATE SET content = EXCLUDED.content
            """,
            run_id, section, content,
        )


async def get_sections(run_id: str) -> dict[str, str]:
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT section, content FROM report_sections WHERE run_id=$1", run_id
        )
        return {r["section"]: r["content"] for r in rows}


# ── events ───────────────────────────────────────────────────────────────────

async def save_events_batch(run_id: str, events: list[dict]) -> None:
    if not events:
        return
    now = datetime.utcnow()
    async with _pool.acquire() as conn:
        await conn.executemany(
            "INSERT INTO run_events (run_id, event_json, created_at) VALUES ($1, $2, $3)",
            [(run_id, json.dumps(e), now) for e in events],
        )


async def get_events(run_id: str) -> list[dict]:
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT event_json FROM run_events WHERE run_id=$1 ORDER BY id", run_id
        )
        return [json.loads(r["event_json"]) for r in rows]


# ── cache ────────────────────────────────────────────────────────────────────

async def find_cached_run(ticker: str) -> dict | None:
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT * FROM runs
            WHERE ticker = $1
              AND status = 'done'
              AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now())
              AND EXTRACT(WEEK FROM created_at) = EXTRACT(WEEK FROM now())
            ORDER BY created_at DESC
            LIMIT 1
            """,
            ticker.upper(),
        )
        if not row:
            return None
        d = dict(row)
        for k in ("trade_date", "created_at", "finished_at"):
            if d.get(k) is not None:
                d[k] = str(d[k])
        return d


async def create_cache_hit_run(user_id: str, source_run: dict) -> dict:
    import uuid
    new_id = str(uuid.uuid4())
    now = datetime.utcnow()
    # config from find_cached_run is a raw JSON string (asyncpg JSONB → str)
    config = source_run.get("config", "{}")
    config_str = config if isinstance(config, str) else json.dumps(config)
    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO runs
              (id, user_id, cache_source_run_id, ticker, trade_date, config,
               status, decision, llm_provider, created_at, finished_at)
            VALUES ($1,$2,$3,$4,$5,$6,'done',$7,$8,$9,$9)
            """,
            new_id,
            user_id,
            source_run["id"],
            source_run["ticker"],
            source_run["trade_date"],
            config_str,
            source_run.get("decision"),
            source_run.get("llm_provider"),
            now,
        )
    return {**source_run, "id": new_id, "user_id": user_id,
            "cache_source_run_id": source_run["id"],
            "config": config_str,
            "created_at": str(now), "finished_at": str(now)}


# ── credits ──────────────────────────────────────────────────────────────────

async def get_credit_balance(user_id: str) -> int:
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT COALESCE(SUM(delta), 0) AS balance FROM credits WHERE user_id=$1",
            user_id,
        )
        return int(row["balance"])


async def deduct_credit(user_id: str, run_id: str) -> None:
    _admin_client().table("credits").insert({
        "user_id": user_id,
        "delta": -1,
        "reason": "run_charge",
        "run_id": run_id,
    }).execute()


# ── trading memory ────────────────────────────────────────────────────────────

async def insert_trading_memory(
    run_id: str,
    ticker: str,
    trade_date: str,
    rating: str | None,
    decision: str,
) -> None:
    _admin_client().table("trading_memory").upsert({
        "run_id": run_id,
        "ticker": ticker,
        "trade_date": trade_date,
        "rating": rating,
        "decision": decision,
        "pending": True,
    }).execute()
