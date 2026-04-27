"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";

const PACKS = [
  { id: "5",  credits: 5,  price: "$9",  label: "Starter",  perCredit: "$1.80" },
  { id: "10", credits: 10, price: "$15", label: "Standard", perCredit: "$1.50", popular: true },
  { id: "25", credits: 25, price: "$29", label: "Pro",      perCredit: "$1.16" },
];

interface CreditRow {
  delta: number;
  reason: string;
  created_at: string;
}

function BillingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<CreditRow[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const success = searchParams.get("success") === "1";

  useEffect(() => {
    async function load() {
      const supabase = getBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data } = await supabase
        .from("credits")
        .select("delta, reason, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (data) {
        setHistory(data);
        setBalance(data.reduce((s: number, r: CreditRow) => s + r.delta, 0));
      } else {
        setBalance(0);
      }
    }
    load();
  }, [router]);

  async function handleBuy(packId: string) {
    setBuying(packId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: packId }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (e) {
      alert(String(e));
      setBuying(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        {balance !== null && (
          <span className="text-sm text-gray-400">
            Balance:{" "}
            <span className="text-green-400 font-semibold">{balance} credit{balance !== 1 ? "s" : ""}</span>
          </span>
        )}
      </div>

      {success && (
        <div className="bg-green-900/30 border border-green-700 rounded-lg px-4 py-3 text-green-300 text-sm">
          Credits added! Your balance has been updated.
        </div>
      )}

      {/* Pack cards */}
      <div className="grid grid-cols-3 gap-4">
        {PACKS.map((pack) => (
          <div
            key={pack.id}
            className={`relative rounded-xl border p-5 space-y-4 ${
              pack.popular
                ? "border-green-500 bg-green-900/10"
                : "border-gray-700 bg-gray-900"
            }`}
          >
            {pack.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-semibold px-3 py-0.5 rounded-full">
                Popular
              </span>
            )}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{pack.label}</p>
              <p className="text-2xl font-bold text-white mt-1">
                {pack.price}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {pack.credits} credits · {pack.perCredit}/credit
              </p>
            </div>
            <button
              onClick={() => handleBuy(pack.id)}
              disabled={buying !== null}
              className={`w-full py-2 rounded text-sm font-medium transition-colors disabled:opacity-50 ${
                pack.popular
                  ? "bg-green-600 hover:bg-green-500 text-white"
                  : "bg-gray-800 hover:bg-gray-700 text-gray-200"
              }`}
            >
              {buying === pack.id ? "Redirecting…" : `Buy ${pack.credits} credits`}
            </button>
          </div>
        ))}
      </div>

      {/* Credit history */}
      {history.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">History</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs">
                  <th className="text-left px-4 py-3 font-normal">Date</th>
                  <th className="text-left px-4 py-3 font-normal">Reason</th>
                  <th className="text-right px-4 py-3 font-normal">Amount</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row, i) => (
                  <tr key={i} className="border-b border-gray-800 last:border-0">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-300 capitalize">
                      {row.reason.replace(/_/g, " ")}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${
                      row.delta > 0 ? "text-green-400" : "text-red-400"
                    }`}>
                      {row.delta > 0 ? "+" : ""}{row.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-600">
        Credits never expire.{" "}
        <Link href="/" className="text-gray-500 hover:text-gray-400">
          Back to runs
        </Link>
      </p>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}
