import type { AgentStatus } from "@/lib/types";

const TEAMS: { name: string; agents: string[] }[] = [
  { name: "Analyst Team",      agents: ["Market Analyst","Social Analyst","News Analyst","Fundamentals Analyst"] },
  { name: "Research Team",     agents: ["Bull Researcher","Bear Researcher","Research Manager"] },
  { name: "Trading Team",      agents: ["Trader"] },
  { name: "Risk Management",   agents: ["Aggressive Analyst","Conservative Analyst","Neutral Analyst"] },
  { name: "Portfolio Mgmt",    agents: ["Portfolio Manager"] },
];

const ICONS: Record<AgentStatus, string> = {
  pending:     "○",
  in_progress: "◎",
  completed:   "●",
};

const COLORS: Record<AgentStatus, string> = {
  pending:     "text-gray-500",
  in_progress: "text-blue-400 animate-pulse",
  completed:   "text-green-400",
};

export default function AgentProgressPanel({
  statuses,
}: {
  statuses: Record<string, AgentStatus>;
}) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Agent Progress</h2>
      <div className="space-y-4">
        {TEAMS.map(({ name, agents }) => {
          const relevantAgents = agents.filter((a) => a in statuses);
          if (relevantAgents.length === 0) return null;
          return (
            <div key={name}>
              <p className="text-xs text-gray-600 mb-1">{name}</p>
              <div className="space-y-1">
                {relevantAgents.map((agent) => {
                  const status = statuses[agent] ?? "pending";
                  return (
                    <div key={agent} className="flex items-center gap-2 text-sm">
                      <span className={`text-base leading-none ${COLORS[status]}`}>
                        {ICONS[status]}
                      </span>
                      <span className={status === "completed" ? "text-gray-300" : status === "in_progress" ? "text-white" : "text-gray-600"}>
                        {agent}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
