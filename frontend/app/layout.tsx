import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "TradingAgents",
  description: "Multi-agent LLM trading analysis",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Navigation />
        <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  );
}
