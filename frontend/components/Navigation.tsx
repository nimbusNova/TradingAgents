"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/",          label: "Runs" },
  { href: "/run/new",   label: "New Analysis" },
  { href: "/memory",    label: "Memory Log" },
];

export default function Navigation() {
  const path = usePathname();
  return (
    <nav className="border-b border-gray-800 bg-gray-900">
      <div className="container mx-auto px-4 max-w-7xl flex items-center gap-8 h-14">
        <Link href="/" className="text-green-400 font-bold text-lg tracking-tight">
          TradingAgents
        </Link>
        <div className="flex gap-1">
          {links.map(({ href, label }) => (
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
      </div>
    </nav>
  );
}
