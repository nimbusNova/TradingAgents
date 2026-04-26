"""
DB dispatcher — routes to SQLite (local dev) or Supabase Postgres (deployed).

Set USE_ACTUAL_DB=true to use Supabase. Default: SQLite.
"""
from __future__ import annotations
import os

USE_ACTUAL_DB: bool = os.environ.get("USE_ACTUAL_DB", "false").lower() == "true"

if USE_ACTUAL_DB:
    from .db_postgres import (  # noqa: F401
        init_db,
        create_run,
        update_run_status,
        get_run,
        list_runs,
        upsert_section,
        get_sections,
        save_events_batch,
        get_events,
        find_cached_run,
        create_cache_hit_run,
        deduct_credit,
        get_credit_balance,
        insert_trading_memory,
    )
else:
    from .db_sqlite import (  # noqa: F401
        init_db,
        create_run,
        update_run_status,
        get_run,
        list_runs,
        upsert_section,
        get_sections,
        save_events_batch,
        get_events,
    )

    # Stubs for Supabase-only functions — no-ops in local dev
    async def find_cached_run(ticker: str) -> dict | None:
        return None

    async def create_cache_hit_run(user_id: str, source_run: dict) -> dict:
        return source_run

    async def deduct_credit(user_id: str, run_id: str) -> None:
        pass

    async def get_credit_balance(user_id: str) -> int:
        return 999  # unlimited in local dev

    async def insert_trading_memory(
        run_id: str, ticker: str, trade_date: str, rating: str | None, decision: str
    ) -> None:
        pass
