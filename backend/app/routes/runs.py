from __future__ import annotations
import asyncio
import json
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from ..models import RunRequest, RunResponse, RunListItem
from .. import db, run_queue
from ..auth import get_current_user

router = APIRouter(prefix="/api/runs", tags=["runs"])


def _cfg(row: dict) -> dict:
    c = row.get("config") or "{}"
    return json.loads(c) if isinstance(c, str) else c


@router.post("", response_model=RunListItem, status_code=201)
async def create_run(req: RunRequest, user: dict = Depends(get_current_user)):
    ticker = req.ticker.upper()

    # Same-week cache check
    cached = await db.find_cached_run(ticker)
    if cached:
        new_run = await db.create_cache_hit_run(user["sub"], cached)
        return RunListItem(
            id=new_run["id"],
            ticker=new_run["ticker"],
            trade_date=str(new_run["trade_date"]),
            status=new_run["status"],
            decision=new_run.get("decision"),
            llm_provider=_cfg(new_run).get("llm_provider", ""),
            created_at=str(new_run["created_at"]),
            finished_at=str(new_run["finished_at"]) if new_run.get("finished_at") else None,
            cache_hit=True,
        )

    # Credit gate
    balance = await db.get_credit_balance(user["sub"])
    if balance <= 0:
        raise HTTPException(status_code=402, detail="no_credits")

    run_id = str(uuid.uuid4())
    config = req.model_dump()
    await db.create_run(run_id, ticker, req.analysis_date, config, user_id=user["sub"])
    await run_queue.enqueue_run(run_id, user_id=user["sub"])
    row = await db.get_run(run_id)
    return RunListItem(
        id=run_id,
        ticker=row["ticker"],
        trade_date=row["trade_date"],
        status=row["status"],
        decision=row.get("decision"),
        llm_provider=_cfg(row).get("llm_provider", ""),
        created_at=row["created_at"],
        finished_at=row.get("finished_at"),
    )


@router.get("", response_model=list[RunListItem])
async def list_runs(user: dict = Depends(get_current_user)):
    rows = await db.list_runs(user_id=user["sub"])
    result = []
    for row in rows:
        result.append(RunListItem(
            id=row["id"],
            ticker=row["ticker"],
            trade_date=row["trade_date"],
            status=row["status"],
            decision=row.get("decision"),
            llm_provider=_cfg(row).get("llm_provider", ""),
            created_at=row["created_at"],
            finished_at=row.get("finished_at"),
        ))
    return result


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(run_id: str, user: dict = Depends(get_current_user)):
    row = await db.get_run(run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")

    run_user = row.get("user_id")
    if run_user is not None and run_user != user["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    sections = await db.get_sections(run_id)
    cfg = _cfg(row)
    return RunResponse(
        id=row["id"],
        ticker=row["ticker"],
        trade_date=row["trade_date"],
        status=row["status"],
        decision=row.get("decision"),
        llm_provider=cfg.get("llm_provider", ""),
        created_at=row["created_at"],
        finished_at=row.get("finished_at"),
        config=cfg,
        sections=sections,
    )


@router.get("/{run_id}/stream")
async def stream_run(run_id: str, user: dict = Depends(get_current_user)):
    row = await db.get_run(run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")

    run_user = row.get("user_id")
    if run_user is not None and run_user != user["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    async def event_generator() -> AsyncGenerator[str, None]:
        def fmt(event: dict) -> str:
            return f"data: {json.dumps(event)}\n\n"

        rs = run_queue.get_run_state(run_id)
        if rs:
            buffered = list(rs.events)
            for ev in buffered:
                yield fmt(ev)

            if not rs.done:
                while not rs.done:
                    try:
                        ev = await asyncio.wait_for(rs.queue.get(), timeout=30.0)
                        yield fmt(ev)
                        if ev.get("type") in ("done", "error"):
                            break
                    except asyncio.TimeoutError:
                        yield ": keepalive\n\n"
        else:
            events = await db.get_events(run_id)
            for ev in events:
                yield fmt(ev)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
