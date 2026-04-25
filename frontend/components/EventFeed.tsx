import type { SseEvent } from "@/lib/types";

function truncate(s: string, n = 120) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function EventRow({ event }: { event: SseEvent }) {
  if (event.type === "tool_call") {
    const argsStr = Object.entries(event.args ?? {})
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(", ");
    return (
      <div className="flex gap-2 text-xs">
        <span className="text-purple-400 shrink-0">⚙ Tool</span>
        <span className="text-gray-300 font-mono">{event.tool}({truncate(argsStr, 80)})</span>
      </div>
    );
  }
  if (event.type === "agent_status") {
    const color =
      event.status === "completed" ? "text-green-400" :
      event.status === "in_progress" ? "text-blue-400" : "text-gray-500";
    return (
      <div className="flex gap-2 text-xs">
        <span className={`shrink-0 ${color}`}>● Agent</span>
        <span className="text-gray-300">{event.agent} → {event.status}</span>
      </div>
    );
  }
  if (event.type === "report_section") {
    return (
      <div className="flex gap-2 text-xs">
        <span className="text-yellow-400 shrink-0">📄 Report</span>
        <span className="text-gray-300">{event.section} ready</span>
      </div>
    );
  }
  if (event.type === "queued") {
    return (
      <div className="text-xs text-gray-500">⏳ Queued at position {event.position}</div>
    );
  }
  if (event.type === "error") {
    return (
      <div className="text-xs text-red-400">✗ Error: {truncate(event.message)}</div>
    );
  }
  if (event.type === "done") {
    return (
      <div className="text-xs text-green-400 font-semibold">✓ Analysis complete → {event.decision}</div>
    );
  }
  return null;
}

export default function EventFeed({ events }: { events: SseEvent[] }) {
  const reversed = [...events].reverse();
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 h-64 overflow-y-auto flex flex-col-reverse">
      <div className="space-y-2">
        {reversed.map((ev, i) => (
          <EventRow key={i} event={ev} />
        ))}
        {events.length === 0 && (
          <p className="text-xs text-gray-600 italic">Waiting for events…</p>
        )}
      </div>
    </div>
  );
}
