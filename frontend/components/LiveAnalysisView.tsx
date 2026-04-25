"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SseEvent, AgentStatus } from "@/lib/types";
import AgentProgressPanel from "./AgentProgressPanel";
import EventFeed from "./EventFeed";
import ReportPanel from "./ReportPanel";
import StatsBar from "./StatsBar";
import FinalDecisionBadge from "./FinalDecisionBadge";
import { streamRunUrl } from "@/lib/api";

const ALL_AGENTS = [
  "Market Analyst","Social Analyst","News Analyst","Fundamentals Analyst",
  "Bull Researcher","Bear Researcher","Research Manager",
  "Trader",
  "Aggressive Analyst","Conservative Analyst","Neutral Analyst",
  "Portfolio Manager",
];

function initStatuses(analysts: string[]): Record<string, AgentStatus> {
  const analystMap: Record<string, string> = {
    market: "Market Analyst", social: "Social Analyst",
    news: "News Analyst", fundamentals: "Fundamentals Analyst",
  };
  const statuses: Record<string, AgentStatus> = {};
  analysts.forEach((a) => { if (analystMap[a]) statuses[analystMap[a]] = "pending"; });
  ["Bull Researcher","Bear Researcher","Research Manager","Trader",
   "Aggressive Analyst","Conservative Analyst","Neutral Analyst","Portfolio Manager"]
    .forEach((a) => { statuses[a] = "pending"; });
  return statuses;
}

export default function LiveAnalysisView({
  runId,
  ticker,
  tradeDate,
  analysts,
  initialSections,
  initialDecision,
  initialStatus,
}: {
  runId: string;
  ticker: string;
  tradeDate: string;
  analysts: string[];
  initialSections: Record<string, string>;
  initialDecision: string | null;
  initialStatus: string;
}) {
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>(
    () => initStatuses(analysts)
  );
  const [events, setEvents]       = useState<SseEvent[]>([]);
  const [sections, setSections]   = useState<Record<string, string>>(initialSections);
  const [decision, setDecision]   = useState<string | null>(initialDecision);
  const [isDone, setIsDone]       = useState(
    initialStatus === "done" || initialStatus === "error"
  );
  const [error, setError]         = useState<string | null>(null);
  const [elapsed, setElapsed]     = useState(0);
  const startRef = useRef(Date.now());
  const esRef    = useRef<EventSource | null>(null);

  // Elapsed timer
  useEffect(() => {
    if (isDone) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isDone]);

  // SSE subscription
  useEffect(() => {
    if (isDone && Object.keys(initialSections).length > 0) return; // already done, no stream needed

    const es = new EventSource(streamRunUrl(runId));
    esRef.current = es;

    es.onmessage = (e) => {
      const ev: SseEvent = JSON.parse(e.data);
      setEvents((prev) => [...prev, ev]);

      if (ev.type === "agent_status") {
        setStatuses((prev) => ({ ...prev, [ev.agent]: ev.status }));
      } else if (ev.type === "report_section") {
        setSections((prev) => ({ ...prev, [ev.section]: ev.content }));
      } else if (ev.type === "done") {
        setDecision(ev.decision);
        setIsDone(true);
        es.close();
      } else if (ev.type === "error") {
        setError(ev.message);
        setIsDone(true);
        es.close();
      }
    };

    es.onerror = () => {
      if (!isDone) setError("Connection lost — the run may have finished.");
      es.close();
    };

    return () => es.close();
  }, [runId]); // eslint-disable-line react-hooks/exhaustive-deps

  const completedAgents = Object.values(statuses).filter((s) => s === "completed").length;
  const totalAgents     = Object.keys(statuses).length;
  const toolCallCount   = events.filter((e) => e.type === "tool_call").length;
  const sectionsReady   = Object.values(sections).filter(Boolean).length;
  const TOTAL_SECTIONS  = 7; // 4 analyst + investment_plan + trader_plan + final_decision

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">
            <span className="font-mono text-green-400">{ticker}</span>
            <span className="text-gray-500 font-normal text-base ml-2">· {tradeDate}</span>
          </h1>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>{completedAgents}/{totalAgents} agents</span>
          {decision && <FinalDecisionBadge decision={decision} size="md" />}
          {isDone && (
            <Link
              href={`/run/${runId}/report`}
              className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-sm transition-colors"
            >
              Full Report →
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Stats bar */}
      <StatsBar
        toolCalls={toolCallCount}
        sectionsReady={sectionsReady}
        totalSections={TOTAL_SECTIONS}
        elapsedSeconds={elapsed}
        isDone={isDone}
      />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: progress + feed */}
        <div className="space-y-4">
          <AgentProgressPanel statuses={statuses} />
          <EventFeed events={events} />
        </div>

        {/* Right column: live report (2/3 width) */}
        <div className="lg:col-span-2">
          <ReportPanel sections={sections} />
        </div>
      </div>
    </div>
  );
}
