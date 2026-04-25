from __future__ import annotations
from fastapi import APIRouter, Query
from pathlib import Path

from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.agents.utils.memory import TradingMemoryLog

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("")
async def get_memory(ticker: str = Query(default=None)):
    log = TradingMemoryLog(DEFAULT_CONFIG)
    entries = log.load_entries()
    if ticker:
        entries = [e for e in entries if e["ticker"].upper() == ticker.upper()]
    # Return newest first
    return list(reversed(entries))
