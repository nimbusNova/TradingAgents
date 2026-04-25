interface StatsBarProps {
  toolCalls: number;
  sectionsReady: number;
  totalSections: number;
  elapsedSeconds: number;
  isDone: boolean;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-2">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-mono text-gray-200 mt-0.5">{value}</span>
    </div>
  );
}

function fmt(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function StatsBar({ toolCalls, sectionsReady, totalSections, elapsedSeconds, isDone }: StatsBarProps) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 flex flex-wrap divide-x divide-gray-800">
      <Stat label="Elapsed" value={fmt(elapsedSeconds)} />
      <Stat label="Tool Calls" value={String(toolCalls)} />
      <Stat label="Sections" value={`${sectionsReady} / ${totalSections}`} />
      {isDone && (
        <div className="flex items-center px-4 py-2">
          <span className="text-xs text-green-400 font-semibold">✓ Complete</span>
        </div>
      )}
    </div>
  );
}
