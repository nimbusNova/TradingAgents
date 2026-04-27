import type { RunConfig, RunListItem, RunDetail, Provider, MemoryEntry } from "./types";

const BASE =
  typeof window === "undefined"
    ? `${process.env.BACKEND_URL ?? "http://localhost:8001"}/api`
    : "/api";

const HOSTED = process.env.NEXT_PUBLIC_HOSTED_MODE === "true";

async function getAuthHeader(): Promise<Record<string, string>> {
  if (!HOSTED) return {};
  const { getBrowserClient } = await import("./supabase");
  const supabase = getBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function createRun(config: RunConfig): Promise<RunListItem> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await getAuthHeader()),
  };
  const res = await fetch(`${BASE}/runs`, {
    method: "POST",
    headers,
    body: JSON.stringify(config),
  });
  if (res.status === 402) throw new Error("no_credits");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listRuns(): Promise<RunListItem[]> {
  const res = await fetch(`${BASE}/runs`, { headers: await getAuthHeader() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRun(id: string): Promise<RunDetail> {
  const res = await fetch(`${BASE}/runs/${id}`, { headers: await getAuthHeader() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listProviders(): Promise<Provider[]> {
  const res = await fetch(`${BASE}/providers`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getMemory(ticker?: string): Promise<MemoryEntry[]> {
  const url = ticker ? `${BASE}/memory?ticker=${encodeURIComponent(ticker)}` : `${BASE}/memory`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function streamRunUrl(id: string): Promise<string> {
  const apiBase = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001"}/api`;
  if (!HOSTED) return `${apiBase}/runs/${id}/stream`;
  const { getBrowserClient } = await import("./supabase");
  const { data: { session } } = await getBrowserClient().auth.getSession();
  const token = session?.access_token;
  return token
    ? `${apiBase}/runs/${id}/stream?token=${encodeURIComponent(token)}`
    : `${apiBase}/runs/${id}/stream`;
}
