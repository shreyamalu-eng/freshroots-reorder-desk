import { aiJson, aiModel, aiProvider } from "../../../lib/ai";
import { query } from "../../../lib/db";
import { zohoApi, zohoConfigured } from "../../../lib/zoho";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** What is connected. Never returns secrets. */
export async function GET() {
  let neon: { ok: boolean; host?: string; error?: string };
  try {
    await query("select 1");
    neon = { ok: true, host: new URL(process.env.DATABASE_URL!).hostname };
  } catch (e) { neon = { ok: false, error: (e as Error).message }; }
  const [zsync] = await query<{ at: string | null; n: number }>("select max(synced_at) as at, count(*)::int as n from open_pos where source = 'zoho'").catch(() => [{ at: null, n: 0 }]);
  return Response.json({
    neon,
    ai: { configured: Boolean(aiProvider()), provider: aiProvider(), model: aiProvider() ? aiModel() : null },
    zoho: { configured: zohoConfigured(), dc: process.env.ZOHO_DC || "in", lastSync: zsync?.at ?? null, openPoLines: zsync?.n ?? 0 },
    cron: { configured: Boolean(process.env.CRON_SECRET), schedule: "Mon + Thu 06:00 IST" },
  });
}

/** Live test: body {target: "ai" | "zoho"}. */
export async function POST(req: Request) {
  const { target } = (await req.json().catch(() => ({}))) as { target?: string };
  const t0 = Date.now();
  try {
    if (target === "ai") {
      const text = await aiJson('Reply with this JSON exactly: {"ok": true}', "You are a connectivity check. Reply with JSON only.");
      return Response.json({ ok: /true/.test(text), ms: Date.now() - t0, provider: aiProvider(), model: aiModel() });
    }
    if (target === "zoho") {
      if (!zohoConfigured()) return Response.json({ ok: false, error: "Zoho is not connected." }, { status: 409 });
      const r = await zohoApi<{ items?: unknown[] }>("/items?per_page=1");
      return Response.json({ ok: true, ms: Date.now() - t0, sampleItems: (r.items ?? []).length });
    }
    return Response.json({ error: "target must be ai or zoho" }, { status: 400 });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message, ms: Date.now() - t0 }, { status: 502 });
  }
}
