import { createRun, getRun } from "../../../lib/planner";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? undefined;
  const data = await getRun(id);
  return data ? Response.json(data) : Response.json({ run: null }, { status: 404 });
}

/** "Run now": body {runDate?: "YYYY-MM-DD"}. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { runDate?: string };
  const runDate = body.runDate && /^\d{4}-\d{2}-\d{2}$/.test(body.runDate) ? body.runDate : todayIST();
  const out = await createRun(runDate, "manual");
  return Response.json(out, { status: out.blocked ? 422 : 201 });
}

function todayIST() {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
