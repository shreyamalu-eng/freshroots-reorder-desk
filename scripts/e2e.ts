// End-to-end test of the running app (no Python needed). Usage: BASE=http://localhost:3000 npx tsx scripts/e2e.ts
// Uses CRON_SECRET from the environment or .env.local. Exits 1 if any check fails.
import { loadEnv } from "./env";
loadEnv();
const B = process.env.BASE ?? "http://localhost:3000";
let failed = 0;
const check = (name: string, ok: boolean, detail: string) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
};
const j = async (path: string, init?: RequestInit) => {
  const r = await fetch(B + path, { ...init, headers: { "content-type": "application/json", ...((init?.headers as Record<string, string>) ?? {}) } });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* csv or empty */ }
  return { status: r.status, body };
};
const post = (path: string, data: unknown) => j(path, { method: "POST", body: JSON.stringify(data) });

const h = await j("/api/health");
check("health", h.status === 200 && h.body.ok, `db host ${h.body.db?.host} · pooled ${h.body.db?.pooled} · ${h.body.db?.skus} SKUs · ${h.body.db?.sales} sales rows`);
check("database is Neon", String(h.body.db?.host ?? "").endsWith("neon.tech"), String(h.body.db?.host));
check("cron refuses without secret", (await j("/api/cron")).status === 401, "401");

const run = await post("/api/runs", { runDate: "2026-10-22" });
check("manual run", run.status === 201 && !run.body.blocked, JSON.stringify(run.body.counts));
if (run.status !== 201) { console.log("\nStopping: the run did not start, so the remaining checks cannot run."); process.exit(1); }
const id = run.body.runId as string;
const latest = await j("/api/runs?id=" + id);
const recs = latest.body.recommendations as { sku: string; status: string; recommendedQty: number | null; coverWeeks: number }[];
const todo = recs.filter((r) => ["reorder_now", "reorder", "pause", "exception"].includes(r.status));
console.log("      queue: " + todo.map((r) => `${r.sku} ${r.status} ${r.coverWeeks}wk qty ${r.recommendedQty}`).join(" | "));
check("queue matches the case", todo.length === 7 && recs.filter((r) => r.status === "reorder_now").length === 5, `${todo.length} to decide`);

const noNote = await post(`/api/runs/${id}/decisions`, { sku: "SKU011", decision: "edited", qty: 250, decidedBy: "e2e" });
check("edit without a note is refused", noNote.status === 400, String(noNote.body.error));
const early = await post(`/api/runs/${id}/handoff`, { sentBy: "e2e" });
check("hand-off waits for every decision", early.status === 409, String(early.body.error));

for (const r of todo) {
  const body = r.sku === "SKU011"
    ? { sku: r.sku, decision: "edited", qty: 250, note: "e2e: truck holds 250", decidedBy: "e2e" }
    : { sku: r.sku, decision: "approved", qty: r.recommendedQty, decidedBy: "e2e" };
  const d = await post(`/api/runs/${id}/decisions`, body);
  if (d.status !== 201) check(`decision ${r.sku}`, false, JSON.stringify(d.body));
}
const sent = await post(`/api/runs/${id}/handoff`, { sentBy: "e2e" });
check("hand-off", sent.status === 201, `${sent.body.lineCount} lines · ${sent.body.totalUnits} units`);
const csv = await j(`/api/runs/${id}/handoff`);
check("CSV download", csv.status === 200 && String(csv.body).startsWith("sku,name,action"), `${String(csv.body).trim().split("\n").length - 1} rows`);
const late = await post(`/api/runs/${id}/decisions`, { sku: "SKU001", decision: "approved", qty: 1, decidedBy: "e2e" });
check("decisions locked after hand-off", late.status === 409, String(late.body.error));
const cron = await j("/api/cron", { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } });
check("cron with secret", cron.status === 201, JSON.stringify(cron.body.counts));

console.log(failed ? `\n${failed} check(s) FAILED` : "\nALL CHECKS PASSED");
process.exit(failed ? 1 : 0);
