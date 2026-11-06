import { createRun } from "../../../lib/planner";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Vercel Cron, Mon + Thu 00:30 UTC (06:00 IST). Vercel sends Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const runDate = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const out = await createRun(runDate, "schedule");
  return Response.json(out, { status: out.blocked ? 422 : 201 });
}
