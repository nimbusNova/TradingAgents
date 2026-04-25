import { notFound } from "next/navigation";
import Link from "next/link";
import { getRun } from "@/lib/api";
import ReportView from "@/components/ReportView";
import FinalDecisionBadge from "@/components/FinalDecisionBadge";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let run;
  try {
    run = await getRun(id);
  } catch {
    notFound();
  }

  if (run.status !== "done") {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Report not ready yet.</p>
        <Link href={`/run/${id}`} className="mt-4 inline-block text-green-400 hover:underline">
          ← Back to live view
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link href={`/run/${id}`} className="text-sm text-gray-500 hover:text-gray-300">
            ← Back to run
          </Link>
          <h1 className="text-2xl font-bold text-white mt-1">
            <span className="font-mono text-green-400">{run.ticker}</span>
            <span className="text-gray-500 font-normal text-base ml-2">· {run.trade_date}</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <FinalDecisionBadge decision={run.decision} size="lg" />
          <PrintButton />
        </div>
      </div>

      <ReportView sections={run.sections ?? {}} />
    </div>
  );
}
