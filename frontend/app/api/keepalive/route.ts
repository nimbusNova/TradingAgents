export const runtime = "nodejs";

export async function GET() {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8001";
  try {
    const res = await fetch(`${backendUrl}/health`, { cache: "no-store" });
    return Response.json({ ok: res.ok, status: res.status });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
