import type { Decision } from "@/lib/types";

const COLORS: Record<string, string> = {
  BUY:         "bg-green-600 text-white",
  OVERWEIGHT:  "bg-emerald-600 text-white",
  HOLD:        "bg-yellow-600 text-white",
  UNDERWEIGHT: "bg-orange-600 text-white",
  SELL:        "bg-red-600 text-white",
};

export default function FinalDecisionBadge({
  decision,
  size = "md",
}: {
  decision: string | null;
  size?: "sm" | "md" | "lg";
}) {
  if (!decision) return <span className="text-gray-500 italic">Pending</span>;
  const upper = decision.toUpperCase() as Decision;
  const color = COLORS[upper] ?? "bg-gray-600 text-white";
  const sizeClass = size === "lg" ? "px-5 py-2 text-lg font-bold" : size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm font-semibold";
  return (
    <span className={`inline-block rounded-full ${sizeClass} ${color}`}>
      {upper}
    </span>
  );
}
