import { getMemory } from "@/lib/api";
import MemoryLogView from "@/components/MemoryLogView";
import type { MemoryEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  let entries: MemoryEntry[] = [];
  try {
    entries = await getMemory();
  } catch {
    // backend may not be up
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Memory Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Past trading decisions, realised outcomes, and AI reflections.
        </p>
      </div>
      <MemoryLogView entries={entries} />
    </div>
  );
}
