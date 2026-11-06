import { query } from "../../../../../lib/db";
import { validateDecision, type Decision } from "../../../../../lib/planner";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function locked(runId: string) {
  const [r] = await query<{ status: string }>("select status from runs where id = $1", [runId]);
  return !r ? "Run not found." : r.status === "sent" ? "This run was already sent to procurement. Decisions are locked." : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lock = await locked(id);
  if (lock) return Response.json({ error: lock }, { status: 409 });
  const d = (await req.json().catch(() => ({}))) as Partial<Decision>;
  const err = validateDecision(d);
  if (err) return Response.json({ error: err }, { status: 400 });
  const rows = await query(
    `insert into decisions (run_id, sku, decision, final_qty, note, decided_by) values ($1,$2,$3,$4,$5,$6)
     on conflict (run_id, sku) do update set decision=excluded.decision, final_qty=excluded.final_qty, note=excluded.note, decided_by=excluded.decided_by, decided_at=now()
     returning sku, decision, final_qty, note, decided_by, decided_at`,
    [id, d.sku, d.decision, d.decision === "rejected" ? null : Math.round(Number(d.qty)), d.note?.trim() || null, String(d.decidedBy).trim()],
  );
  return Response.json(rows[0], { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lock = await locked(id);
  if (lock) return Response.json({ error: lock }, { status: 409 });
  const sku = new URL(req.url).searchParams.get("sku");
  await query("delete from decisions where run_id = $1 and sku = $2", [id, sku]);
  return new Response(null, { status: 204 });
}
