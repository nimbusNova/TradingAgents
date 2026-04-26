"""Async run queue and graph execution."""
from __future__ import annotations
import asyncio
import json
import logging
import traceback
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from . import db

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Per-run state (in-memory replay buffer + live queue)
# ---------------------------------------------------------------------------

@dataclass
class RunState:
    events: list[dict] = field(default_factory=list)
    queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    done: bool = False
    user_id: str = ""


_run_states: dict[str, RunState] = {}
_run_queue: asyncio.Queue = asyncio.Queue()
_current_run_id: Optional[str] = None


def get_run_state(run_id: str) -> Optional[RunState]:
    return _run_states.get(run_id)


# ---------------------------------------------------------------------------
# Thread → event-loop bridge
# ---------------------------------------------------------------------------

def _emit_from_thread(run_id: str, event: dict, loop: asyncio.AbstractEventLoop) -> None:
    """Thread-safe: schedule event delivery on the event loop."""
    def _put():
        rs = _run_states.get(run_id)
        if rs and not rs.done:
            rs.events.append(event)
            rs.queue.put_nowait(event)

    loop.call_soon_threadsafe(_put)


# ---------------------------------------------------------------------------
# State-change tracker
# ---------------------------------------------------------------------------

class AgentTracker:
    """Diffs consecutive full-state chunks and produces SSE events."""

    _ANALYST_MAP = {
        "market":       ("Market Analyst",       "market_report"),
        "social":       ("Social Analyst",        "sentiment_report"),
        "news":         ("News Analyst",          "news_report"),
        "fundamentals": ("Fundamentals Analyst",  "fundamentals_report"),
    }

    def __init__(self, selected_analysts: list[str]) -> None:
        self.selected = selected_analysts
        self._prev: dict = {}

    def process(self, state: dict) -> list[dict]:
        events: list[dict] = []
        prev = self._prev

        # --- Analyst reports ---
        for key in self.selected:
            if key not in self._ANALYST_MAP:
                continue
            agent_name, report_key = self._ANALYST_MAP[key]
            new_val = state.get(report_key) or ""
            old_val = prev.get(report_key) or ""
            if new_val and not old_val:
                events += [
                    {"type": "agent_status", "agent": agent_name, "status": "completed"},
                    {"type": "report_section", "section": report_key, "content": new_val},
                ]

        # --- Investment debate ---
        inv  = state.get("investment_debate_state") or {}
        pinv = prev.get("investment_debate_state") or {}

        if (inv.get("bull_history") or "") != (pinv.get("bull_history") or "") and inv.get("bull_history"):
            events.append({"type": "agent_status", "agent": "Bull Researcher", "status": "in_progress"})

        if (inv.get("bear_history") or "") != (pinv.get("bear_history") or "") and inv.get("bear_history"):
            events.append({"type": "agent_status", "agent": "Bear Researcher", "status": "in_progress"})

        # Research Manager completes when investment_plan appears
        new_plan = state.get("investment_plan") or ""
        old_plan = prev.get("investment_plan") or ""
        if new_plan and not old_plan:
            events += [
                {"type": "agent_status", "agent": "Bull Researcher",    "status": "completed"},
                {"type": "agent_status", "agent": "Bear Researcher",    "status": "completed"},
                {"type": "agent_status", "agent": "Research Manager",   "status": "completed"},
                {"type": "report_section", "section": "investment_plan", "content": new_plan},
            ]

        # --- Trader ---
        new_tp = state.get("trader_investment_plan") or ""
        old_tp = prev.get("trader_investment_plan") or ""
        if new_tp and not old_tp:
            events += [
                {"type": "agent_status", "agent": "Trader", "status": "completed"},
                {"type": "report_section", "section": "trader_investment_plan", "content": new_tp},
            ]

        # --- Risk debate ---
        risk  = state.get("risk_debate_state") or {}
        prisk = prev.get("risk_debate_state") or {}

        for agent, hist_key in [
            ("Aggressive Analyst",  "aggressive_history"),
            ("Conservative Analyst","conservative_history"),
            ("Neutral Analyst",     "neutral_history"),
        ]:
            if (risk.get(hist_key) or "") != (prisk.get(hist_key) or "") and risk.get(hist_key):
                events.append({"type": "agent_status", "agent": agent, "status": "in_progress"})

        # --- Portfolio Manager / final decision ---
        new_fd = state.get("final_trade_decision") or ""
        old_fd = prev.get("final_trade_decision") or ""
        if new_fd and not old_fd:
            events += [
                {"type": "agent_status", "agent": "Aggressive Analyst",  "status": "completed"},
                {"type": "agent_status", "agent": "Conservative Analyst","status": "completed"},
                {"type": "agent_status", "agent": "Neutral Analyst",     "status": "completed"},
                {"type": "agent_status", "agent": "Portfolio Manager",   "status": "completed"},
                {"type": "report_section", "section": "final_trade_decision", "content": new_fd},
            ]

        # --- New tool calls from messages ---
        prev_n = len(prev.get("messages") or [])
        for msg in (state.get("messages") or [])[prev_n:]:
            tool_calls = getattr(msg, "tool_calls", None)
            if tool_calls:
                for tc in tool_calls:
                    name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "")
                    args = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", {})
                    if name:
                        events.append({"type": "tool_call", "tool": name, "args": args})

        self._prev = state
        return events


# ---------------------------------------------------------------------------
# Config builder
# ---------------------------------------------------------------------------

def _build_ta_config(config_data: dict) -> dict:
    from tradingagents.default_config import DEFAULT_CONFIG
    cfg = DEFAULT_CONFIG.copy()
    cfg["llm_provider"]         = config_data["llm_provider"]
    cfg["quick_think_llm"]      = config_data["quick_think_llm"]
    cfg["deep_think_llm"]       = config_data["deep_think_llm"]
    cfg["max_debate_rounds"]    = config_data.get("research_depth", 1)
    cfg["max_risk_discuss_rounds"] = config_data.get("research_depth", 1)
    cfg["output_language"]      = config_data.get("output_language", "English")
    cfg["checkpoint_enabled"]   = config_data.get("checkpoint_enabled", False)
    for k in ("openai_reasoning_effort", "google_thinking_level", "anthropic_effort"):
        if config_data.get(k):
            cfg[k] = config_data[k]
    return cfg


def _parse_decision(text: str) -> str:
    upper = (text or "").upper()
    for signal in ("BUY", "OVERWEIGHT", "UNDERWEIGHT", "SELL", "HOLD"):
        if signal in upper:
            return signal
    return "HOLD"


# ---------------------------------------------------------------------------
# Queue entry point
# ---------------------------------------------------------------------------

async def enqueue_run(run_id: str, user_id: str = "") -> int:
    rs = RunState(user_id=user_id)
    _run_states[run_id] = rs
    position = _run_queue.qsize() + (1 if _current_run_id else 0)
    if position > 0:
        event = {"type": "queued", "position": position}
        rs.events.append(event)
        rs.queue.put_nowait(event)
    await _run_queue.put(run_id)
    return position


async def queue_processor() -> None:
    """Background task — processes one run at a time."""
    global _current_run_id
    loop = asyncio.get_running_loop()
    while True:
        run_id = await _run_queue.get()
        _current_run_id = run_id
        try:
            await _process_run(run_id, loop)
        except Exception:
            logger.exception("Unhandled error processing run %s", run_id)
        finally:
            _current_run_id = None
            _run_queue.task_done()


# ---------------------------------------------------------------------------
# Core run processor
# ---------------------------------------------------------------------------

async def _process_run(run_id: str, loop: asyncio.AbstractEventLoop) -> None:
    run_data = await db.get_run(run_id)
    if not run_data:
        return

    config_data = json.loads(run_data["config"])
    ticker     = run_data["ticker"]
    trade_date = run_data["trade_date"]
    analysts   = config_data.get("analysts", ["market", "social", "news", "fundamentals"])

    await db.update_run_status(run_id, "running")

    rs = _run_states.setdefault(run_id, RunState(user_id=run_data.get("user_id", "")))
    ta_config  = _build_ta_config(config_data)
    tracker    = AgentTracker(analysts)
    final_state: dict | None = None
    error_msg: str | None = None

    def _run_graph() -> None:
        nonlocal final_state, error_msg
        try:
            from tradingagents.graph.trading_graph import TradingAgentsGraph

            graph = TradingAgentsGraph(
                selected_analysts=analysts,
                config=ta_config,
                debug=False,
            )
            graph._resolve_pending_entries(ticker)
            past_context = graph.memory_log.get_past_context(ticker)
            init_state   = graph.propagator.create_initial_state(
                ticker, trade_date, past_context=past_context
            )
            graph_args = graph.propagator.get_graph_args()

            for state in graph.graph.stream(init_state, **graph_args):
                events = tracker.process(state)
                for ev in events:
                    _emit_from_thread(run_id, ev, loop)
                final_state = state

            if final_state:
                graph.memory_log.store_decision(
                    ticker=ticker,
                    trade_date=trade_date,
                    final_trade_decision=final_state.get("final_trade_decision", ""),
                )
                try:
                    graph._log_state(trade_date, final_state)
                except Exception:
                    pass  # logging failure shouldn't abort the run

        except Exception as exc:
            error_msg = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-1000:]}"

    await asyncio.get_running_loop().run_in_executor(None, _run_graph)

    now = datetime.utcnow().isoformat()

    if error_msg:
        _emit_from_thread(run_id, {"type": "error", "message": error_msg[:500]}, loop)
        await asyncio.sleep(0.05)
        await db.save_events_batch(run_id, rs.events)
        await db.update_run_status(run_id, "error", finished_at=now)

    elif final_state:
        decision  = _parse_decision(final_state.get("final_trade_decision", ""))
        done_event = {"type": "done", "decision": decision}
        _emit_from_thread(run_id, done_event, loop)
        await asyncio.sleep(0.05)

        # Persist sections
        inv  = final_state.get("investment_debate_state") or {}
        risk = final_state.get("risk_debate_state") or {}
        sections: dict[str, str] = {
            "market_report":           final_state.get("market_report", ""),
            "sentiment_report":        final_state.get("sentiment_report", ""),
            "news_report":             final_state.get("news_report", ""),
            "fundamentals_report":     final_state.get("fundamentals_report", ""),
            "investment_plan":         final_state.get("investment_plan", ""),
            "trader_investment_plan":  final_state.get("trader_investment_plan", ""),
            "final_trade_decision":    final_state.get("final_trade_decision", ""),
            "debate_bull_history":     inv.get("bull_history", ""),
            "debate_bear_history":     inv.get("bear_history", ""),
            "debate_judge_decision":   inv.get("judge_decision", ""),
            "risk_aggressive_history": risk.get("aggressive_history", ""),
            "risk_conservative_history": risk.get("conservative_history", ""),
            "risk_neutral_history":    risk.get("neutral_history", ""),
            "risk_judge_decision":     risk.get("judge_decision", ""),
        }
        for section, content in sections.items():
            if content:
                await db.upsert_section(run_id, section, content)

        await db.save_events_batch(run_id, rs.events)
        await db.update_run_status(run_id, "done", decision=decision, finished_at=now)

        if rs.user_id:
            await db.deduct_credit(rs.user_id, run_id)
            await db.insert_trading_memory(
                run_id=run_id,
                ticker=ticker,
                trade_date=trade_date,
                rating=decision,
                decision=sections.get("final_trade_decision", ""),
            )

    rs.done = True
    # Keep in memory for 60 s so late-connecting SSE clients can drain
    await asyncio.sleep(60)
    _run_states.pop(run_id, None)
