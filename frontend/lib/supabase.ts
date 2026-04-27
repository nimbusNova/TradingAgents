import { createBrowserClient, createServerClient, type CookieMethodsServer } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export function getBrowserClient() {
  return createBrowserClient(URL, ANON);
}

export function buildServerClient(cookieMethods: CookieMethodsServer) {
  return createServerClient(URL, ANON, { cookies: cookieMethods });
}
