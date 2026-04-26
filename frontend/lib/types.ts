export type RunStatus = "pending" | "running" | "done" | "error";
export type Decision = "BUY" | "OVERWEIGHT" | "HOLD" | "UNDERWEIGHT" | "SELL";
export type AgentStatus = "pending" | "in_progress" | "completed";

export interface RunListItem {
  id: string;
  ticker: string;
  trade_date: string;
  status: RunStatus;
  decision: Decision | null;
  llm_provider: string;
  created_at: string;
  finished_at: string | null;
  cache_hit?: boolean;
}

export interface RunDetail extends RunListItem {
  config: RunConfig;
  sections: Record<string, string>;
}

export interface RunConfig {
  ticker: string;
  analysis_date: string;
  analysts: string[];
  research_depth: number;
  llm_provider: string;
  quick_think_llm: string;
  deep_think_llm: string;
  output_language: string;
  openai_reasoning_effort?: string | null;
  google_thinking_level?: string | null;
  anthropic_effort?: string | null;
}

// SSE events
export type SseEvent =
  | { type: "queued"; position: number }
  | { type: "agent_status"; agent: string; status: AgentStatus }
  | { type: "report_section"; section: string; content: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown> }
  | { type: "stats"; llm_calls: number; tool_calls: number; tokens_in: number; tokens_out: number }
  | { type: "done"; decision: Decision }
  | { type: "error"; message: string };

// Provider catalog
export interface ProviderModel {
  label: string;
  value: string;
}

export interface Provider {
  key: string;
  display: string;
  thinking_config: string | null; // "reasoning_effort" | "effort" | "thinking_level" | null
  quick_models: ProviderModel[];
  deep_models: ProviderModel[];
}

// Memory
export interface MemoryEntry {
  date: string;
  ticker: string;
  rating: string;
  pending: boolean;
  raw: string | null;
  alpha: string | null;
  holding: string | null;
  decision: string;
  reflection: string;
}
