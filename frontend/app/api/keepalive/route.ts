export const runtime = "nodejs";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8001";
  try {
    const res = await fetch(`${backendUrl}/api/health`, { cache: "no-store" });
    return Response.json({ ok: res.ok, status: res.status });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
