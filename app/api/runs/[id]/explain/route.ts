import { explainRun } from "../../../../../lib/planner";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Re-ask the AI for reasons on this run (the ✦ button). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const out = await explainRun(id);
  return Response.json(out, { status: out.error ? 502 : 200 });
}
