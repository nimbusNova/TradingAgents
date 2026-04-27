import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { buildServerClient } from "@/lib/supabase";
import LiveAnalysisView from "@/components/LiveAnalysisView";

export const dynamic = "force-dynamic";

const HOSTED = process.env.NEXT_PUBLIC_HOSTED_MODE === "true";
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8001";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Build auth header server-side by reading the session cookie directly
  let authHeader: Record<string, string> = {};
  if (HOSTED) {
    const cookieStore = await cookies();
    const supabase = buildServerClient({
      getAll: () => cookieStore.getAll(),
      setAll: () => {}, // no-op: can't set cookies in a server component
    });
    const { data: { session } } = await supabase.auth.getSession();
    if (session) authHeader = { Authorization: `Bearer ${session.access_token}` };
  }

  let run;
  try {
    const res = await fetch(`${BACKEND}/api/runs/${id}`, {
      headers: authHeader,
      cache: "no-store",
    });
    if (!res.ok) notFound();
    run = await res.json();
  } catch {
    notFound();
  }

  return (
    <LiveAnalysisView
      runId={run.id}
      ticker={run.ticker}
      tradeDate={run.trade_date}
      analysts={run.config.analysts ?? []}
      initialSections={run.sections ?? {}}
      initialDecision={run.decision}
      initialStatus={run.status}
      createdAt={run.created_at}
      finishedAt={run.finished_at}
    />
  );
}
