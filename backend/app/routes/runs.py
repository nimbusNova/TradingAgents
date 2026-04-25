from __future__ import annotations
import asyncio
import json
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..models import RunRequest, RunResponse, RunListItem
from .. import db, run_queue

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.post("", response_model=RunListItem, status_code=201)
async def create_run(req: RunRequest):
    run_id = str(uuid.uuid4())
    config = req.model_dump()
    await db.create_run(run_id, req.ticker.upper(), req.analysis_date, config)
    position = await run_queue.enqueue_run(run_id)
    row = await db.get_run(run_id)
    cfg = json.loads(row["config"])
    return RunListItem(
        id=run_id,
        ticker=row["ticker"],
        trade_date=row["trade_date"],
        status=row["status"],
        decision=row["decision"],
        llm_provider=cfg.get("llm_provider", ""),
        created_at=row["created_at"],
        finished_at=row["finished_at"],
    )


@router.get("", response_model=list[RunListItem])
async def list_runs():
    rows = await db.list_runs()
    result = []
    for row in rows:
        cfg = json.loads(row["config"])
        result.append(RunListItem(
            id=row["id"],
            ticker=row["ticker"],
            trade_date=row["trade_date"],
            status=row["status"],
            decision=row["decision"],
            llm_provider=cfg.get("llm_provider", ""),
            created_at=row["created_at"],
            finished_at=row["finished_at"],
        ))
    return result


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(run_id: str):
    row = await db.get_run(run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    sections = await db.get_sections(run_id)
    cfg = json.loads(row["config"])
    return RunResponse(
        id=row["id"],
        ticker=row["ticker"],
        trade_date=row["trade_date"],
        status=row["status"],
        decision=row["decision"],
        llm_provider=cfg.get("llm_provider", ""),
        created_at=row["created_at"],
        finished_at=row["finished_at"],
        config=cfg,
        sections=sections,
    )


@router.get("/{run_id}/stream")
async def stream_run(run_id: str):
    row = await db.get_run(run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")

    async def event_generator() -> AsyncGenerator[str, None]:
        def fmt(event: dict) -> str:
            return f"data: {json.dumps(event)}\n\n"

        rs = run_queue.get_run_state(run_id)
        if rs:
            # Stream buffered events first (replay), then subscribe to new ones
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
            # Run already finished — replay from DB
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
