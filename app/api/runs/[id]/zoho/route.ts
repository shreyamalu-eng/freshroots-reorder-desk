import { query, tx } from "../../../../../lib/db";
import { approvedLines } from "../../../../../lib/planner";
import { createDraftPurchaseOrders, planPurchaseOrders, zohoConfigured } from "../../../../../lib/zoho";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Create DRAFT purchase orders in Zoho for a run that has been sent to procurement. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { createdBy?: string };
  if (!body.createdBy?.trim()) return Response.json({ error: "createdBy is required." }, { status: 400 });
  if (!zohoConfigured()) return Response.json({ error: "Zoho is not connected. Add the ZOHO_* settings in Vercel, then try again." }, { status: 409 });
  const [run] = await query<{ status: string; run_date: string }>("select status, run_date from runs where id = $1", [id]);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  if (run.status !== "sent") return Response.json({ error: "Send the approved list to procurement first." }, { status: 409 });
  const [done] = await query<{ n: number }>("select count(*)::int as n from zoho_pos where run_id = $1 and status = 'draft'", [id]);
  if (done.n > 0) return Response.json({ error: "Draft POs already exist in Zoho for this run." }, { status: 409 });
  const plans = planPurchaseOrders(await approvedLines(id));
  if (!plans.length) return Response.json({ error: "No approved reorder lines with a quantity above 0." }, { status: 409 });
  const results = await createDraftPurchaseOrders(plans, `FR-${String(run.run_date).slice(0, 10)}-${id.slice(0, 6)}`);
  await tx(async (c) => {
    for (const r of results) {
      await c.query(
        "insert into zoho_pos (run_id, vendor_name, zoho_po_id, zoho_po_number, status, line_count, total_units, error, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [id, r.vendor, r.poId ?? null, r.poNumber ?? null, r.status, r.lines, r.units, r.error ?? null, body.createdBy!.trim()],
      );
    }
  });
  return Response.json({ results }, { status: results.some((r) => r.status === "draft") ? 201 : 502 });
}
