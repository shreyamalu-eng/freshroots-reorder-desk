import { query } from "../../../lib/db";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const [row] = await query<{ now: string; version: string; skus: number; sales: number; runs: number }>(
      "select now() as now, version() as version, (select count(*)::int from sku_master) as skus, (select count(*)::int from sales_weekly) as sales, (select count(*)::int from runs) as runs",
    );
    const host = (() => { try { return new URL(process.env.DATABASE_URL!).hostname; } catch { return "unknown"; } })();
    // Public endpoint: report health and counts, not the server version.
    return Response.json({ ok: true, db: { host, pooled: host.includes("-pooler"), skus: row.skus, sales: row.sales, runs: row.runs, now: row.now } });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
