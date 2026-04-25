import Link from "next/link";
import { listRuns } from "@/lib/api";
import RunHistory from "@/components/RunHistory";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let runs = [];
  try {
    runs = await listRuns();
  } catch {
    // backend may not be up yet
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Analysis Runs</h1>
        <Link
          href="/run/new"
          className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded text-sm font-medium transition-colors"
        >
          + New Analysis
        </Link>
      </div>
      <RunHistory runs={runs} />
    </div>
  );
}
