"use client";
import { useState } from "react";
import type { MemoryEntry } from "@/lib/types";
import FinalDecisionBadge from "./FinalDecisionBadge";

export default function MemoryLogView({ entries }: { entries: MemoryEntry[] }) {
  const [filter, setFilter] = useState("");
  const filtered = filter
    ? entries.filter((e) => e.ticker.toUpperCase().includes(filter.toUpperCase()))
    : entries;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter by ticker…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
        />
        <span className="text-sm text-gray-500">{filtered.length} entries</span>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">No memory entries found.</div>
      )}

      <div className="space-y-3">
        {filtered.map((entry, i) => (
          <div key={i} className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono font-bold text-white text-lg">{entry.ticker}</span>
                <span className="text-gray-500 text-sm">{entry.date}</span>
                <FinalDecisionBadge decision={entry.rating} size="sm" />
                {entry.pending ? (
                  <span className="px-2 py-0.5 bg-gray-700 text-gray-400 rounded-full text-xs">Pending outcome</span>
                ) : (
                  <div className="flex gap-2 text-xs">
                    <span className={`font-mono ${parseFloat(entry.raw ?? "0") >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {entry.raw} raw
                    </span>
                    <span className={`font-mono ${parseFloat(entry.alpha ?? "0") >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {entry.alpha} alpha
                    </span>
                    {entry.holding && <span className="text-gray-500">{entry.holding}</span>}
                  </div>
                )}
              </div>
            </div>

            {entry.reflection && (
              <div className="mt-3 text-sm text-gray-300 border-l-2 border-green-700 pl-3 italic">
                {entry.reflection}
              </div>
            )}

            {!entry.reflection && entry.decision && (
              <details className="mt-3">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                  View decision summary
                </summary>
                <p className="mt-2 text-xs text-gray-400 line-clamp-3">{entry.decision.slice(0, 300)}…</p>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
