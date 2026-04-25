"use client";
import Link from "next/link";
import type { RunListItem } from "@/lib/types";
import FinalDecisionBadge from "./FinalDecisionBadge";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_PILL: Record<string, string> = {
  pending: "bg-gray-700 text-gray-300",
  running: "bg-blue-700 text-blue-100 animate-pulse",
  done:    "bg-green-800 text-green-200",
  error:   "bg-red-800 text-red-200",
};

export default function RunHistory({ runs }: { runs: RunListItem[] }) {
  if (runs.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        No analyses yet. <Link href="/run/new" className="text-green-400 hover:underline">Start one →</Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900 text-gray-400 text-left">
            <th className="px-4 py-3">Ticker</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Decision</th>
            <th className="px-4 py-3">Provider</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
            >
              <td className="px-4 py-3 font-mono font-bold text-white">
                <Link href={`/run/${run.id}`} className="hover:text-green-400 transition-colors">
                  {run.ticker}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-300">{run.trade_date}</td>
              <td className="px-4 py-3">
                <FinalDecisionBadge decision={run.decision} size="sm" />
              </td>
              <td className="px-4 py-3 text-gray-400 capitalize">{run.llm_provider}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_PILL[run.status] ?? "bg-gray-700 text-gray-300"}`}>
                  {run.status}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500">{timeAgo(run.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
