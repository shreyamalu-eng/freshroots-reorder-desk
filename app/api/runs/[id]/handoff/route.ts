import { query, tx } from "../../../../../lib/db";
import { buildHandoffCsv } from "../../../../../lib/planner";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Send the approved list. Every line that needs a decision must be decided first. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { sentBy?: string };
  if (!body.sentBy?.trim()) return Response.json({ error: "sentBy is required." }, { status: 400 });
  const [run] = await query<{ status: string }>("select status from runs where id = $1", [id]);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  if (run.status === "sent") return Response.json({ error: "Already sent." }, { status: 409 });
  if (run.status === "blocked") return Response.json({ error: "This run was stopped by a data problem. Fix the data and start a new run." }, { status: 409 });
  const [open] = await query<{ n: number }>(
    `select count(*)::int as n from recommendations r left join decisions d on d.run_id = r.run_id and d.sku = r.sku
      where r.run_id = $1 and r.status in ('reorder_now','reorder','pause','exception') and d.sku is null`, [id]);
  if (open.n > 0) return Response.json({ error: `${open.n} line(s) still need a decision.` }, { status: 409 });
  const h = await buildHandoffCsv(id);
  if (!h.csv.trim().includes("\n")) return Response.json({ error: "No approved lines to send." }, { status: 409 });
  const saved = await tx(async (c) => {
    const { rows } = await c.query("insert into handoffs (run_id, line_count, total_units, csv, sent_by) values ($1,$2,$3,$4,$5) returning id, sent_at", [id, h.lineCount, h.totalUnits, h.csv, body.sentBy!.trim()]);
    await c.query("update runs set status = 'sent', sent_at = now() where id = $1", [id]);
    return rows[0];
  });
  return Response.json({ ...saved, lineCount: h.lineCount, totalUnits: h.totalUnits }, { status: 201 });
}

/** Download the CSV of the latest hand-off. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [h] = await query<{ csv: string }>("select csv from handoffs where run_id = $1 order by sent_at desc limit 1", [id]);
  if (!h) return Response.json({ error: "No hand-off yet." }, { status: 404 });
  return new Response(h.csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="freshroots-approved-${id.slice(0, 8)}.csv"` } });
}
