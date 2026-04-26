import { notFound } from "next/navigation";
import { getRun } from "@/lib/api";
import LiveAnalysisView from "@/components/LiveAnalysisView";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let run;
  try {
    run = await getRun(id);
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
