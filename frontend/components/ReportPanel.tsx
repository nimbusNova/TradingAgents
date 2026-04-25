"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SECTION_TITLES: Record<string, string> = {
  market_report:          "Market Analysis",
  sentiment_report:       "Social Sentiment",
  news_report:            "News Analysis",
  fundamentals_report:    "Fundamentals",
  investment_plan:        "Research Manager Decision",
  trader_investment_plan: "Trading Plan",
  final_trade_decision:   "Portfolio Manager Decision",
};

export default function ReportPanel({
  sections,
}: {
  sections: Record<string, string>;
}) {
  const order = [
    "market_report",
    "sentiment_report",
    "news_report",
    "fundamentals_report",
    "investment_plan",
    "trader_investment_plan",
    "final_trade_decision",
  ];

  const available = order.filter((k) => sections[k]);

  if (available.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6 flex items-center justify-center min-h-48">
        <p className="text-gray-600 italic text-sm">Waiting for first report…</p>
      </div>
    );
  }

  // Show the latest section
  const latest = available[available.length - 1];

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3 border-b border-gray-800 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {SECTION_TITLES[latest] ?? latest}
        </h2>
        <span className="text-xs text-gray-600">({available.length} section{available.length > 1 ? "s" : ""} ready)</span>
      </div>
      <div className="prose-dark max-h-96 overflow-y-auto text-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {sections[latest]}
        </ReactMarkdown>
      </div>
    </div>
  );
}
