from __future__ import annotations
import asyncio
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()
load_dotenv(".env.enterprise", override=False)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .run_queue import queue_processor
from .routes import runs, providers, memory


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    task = asyncio.create_task(queue_processor())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="TradingAgents API", lifespan=lifespan)

_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3001").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(runs.router)
app.include_router(providers.router)
app.include_router(memory.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
