from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class RunRequest(BaseModel):
    ticker: str
    analysis_date: str
    analysts: list[str] = ["market", "social", "news", "fundamentals"]
    research_depth: int = 1
    llm_provider: str = "openai"
    quick_think_llm: str = "gpt-4.1-mini"
    deep_think_llm: str = "gpt-4.1"
    output_language: str = "English"
    openai_reasoning_effort: Optional[str] = None
    google_thinking_level: Optional[str] = None
    anthropic_effort: Optional[str] = None
    checkpoint_enabled: bool = False


class RunResponse(BaseModel):
    id: str
    ticker: str
    trade_date: str
    status: str
    decision: Optional[str] = None
    llm_provider: str
    created_at: str
    finished_at: Optional[str] = None
    config: dict
    sections: dict = {}


class RunListItem(BaseModel):
    id: str
    ticker: str
    trade_date: str
    status: str
    decision: Optional[str] = None
    llm_provider: str
    created_at: str
    finished_at: Optional[str] = None


class MemoryEntry(BaseModel):
    date: str
    ticker: str
    rating: str
    pending: bool
    raw: Optional[str] = None
    alpha: Optional[str] = None
    holding: Optional[str] = None
    decision: str
    reflection: str
