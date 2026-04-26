"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const HOSTED = process.env.NEXT_PUBLIC_HOSTED_MODE === "true";

const BASE_LINKS = [
  { href: "/",        label: "Runs" },
  { href: "/run/new", label: "New Analysis" },
  { href: "/memory",  label: "Memory Log" },
];

export default function Navigation() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!HOSTED) return;

    async function loadAuth() {
      const { getBrowserClient } = await import("@/lib/supabase");
      const supabase = getBrowserClient();

      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data } = await supabase
          .from("credits")
          .select("delta")
          .eq("user_id", user.id);
        if (data) {
          setBalance(data.reduce((s: number, r: { delta: number }) => s + r.delta, 0));
        }
      }
    }

    loadAuth();
  }, [path]);

  async function handleSignOut() {
    const { getBrowserClient } = await import("@/lib/supabase");
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
    setBalance(null);
    router.push("/login");
  }

  return (
    <nav className="border-b border-gray-800 bg-gray-900">
      <div className="container mx-auto px-4 max-w-7xl flex items-center gap-8 h-14">
        <Link href="/" className="text-green-400 font-bold text-lg tracking-tight">
          TradingAgents
        </Link>
        <div className="flex gap-1 flex-1">
          {BASE_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                path === href
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {HOSTED && (
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {balance !== null && (
                  <Link
                    href="/billing"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-900/40 border border-green-700/50 text-green-400 text-xs font-semibold hover:bg-green-900/60 transition-colors"
                  >
                    <span>{balance}</span>
                    <span className="text-green-600">credit{balance !== 1 ? "s" : ""}</span>
                  </Link>
                )}
                <Link
                  href="/billing"
                  className="px-3 py-1.5 rounded text-sm bg-green-700 hover:bg-green-600 text-white transition-colors"
                >
                  Buy
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="px-3 py-1.5 rounded text-sm bg-green-700 hover:bg-green-600 text-white transition-colors"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
