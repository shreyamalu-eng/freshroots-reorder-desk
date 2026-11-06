// Server-side run: read inputs from Neon, run the engine, save the run and recommendations.
import { runPlanner } from "../src/engine/engine";
import { buildExplainUserMessage, mergeExplanations } from "../src/engine/explain";
import { DEFAULT_SETTINGS, type Recommendation, type Settings, type SkuMaster } from "../src/engine/types";
import { aiJson, aiProvider } from "./ai";
import { query, tx } from "./db";
import { listOpenPoLines, zohoConfigured } from "./zoho";

/** Refresh open_pos from Zoho (source = zoho). Manual rows are kept. Returns a warning or null. */
export async function syncZohoOpenPos(): Promise<string | null> {
  if (!zohoConfigured()) return null;
  try {
    const lines = await listOpenPoLines();
    const known = new Set((await query<{ sku: string }>("select sku from sku_master")).map((r) => r.sku));
    await tx(async (c) => {
      await c.query("delete from open_pos where source = 'zoho'");
      for (const l of lines.filter((x) => known.has(x.sku))) {
        await c.query(
          `insert into open_pos (po_number, sku, qty, eta, source, synced_at) values ($1,$2,$3,$4,'zoho',now())
           on conflict (po_number, sku) do update set qty = excluded.qty, eta = excluded.eta, source = 'zoho', synced_at = now()`,
          [l.poNumber, l.sku, l.qty, l.eta || null],
        );
      }
    });
    return null;
  } catch (e) {
    return `Zoho open POs not refreshed: ${(e as Error).message}. Cover uses the last known open POs.`;
  }
}

/** Ask the AI for reasons + summary, keep only sentences whose numbers match the engine. */
export async function explainRun(runId: string): Promise<{ used: number; rejected: number; total: number; error?: string }> {
  const recs = (await query<{ detail: Recommendation }>("select detail from recommendations where run_id = $1 and status <> 'ok'", [runId])).map((r) => r.detail);
  if (!recs.length) return { used: 0, rejected: 0, total: 0 };
  if (!aiProvider()) return { used: 0, rejected: 0, total: recs.length, error: "No AI key set." };
  const c = (s: string) => recs.filter((r) => r.status === s).length;
  const runNumbers = { needs_decision: recs.filter((r) => r.status !== "held").length, reorder_now: c("reorder_now"), reorder: c("reorder"), pause: c("pause"), exceptions: c("exception"), held: c("held") };
  try {
    const text = await aiJson(buildExplainUserMessage(recs, runNumbers));
    const merged = mergeExplanations(recs, text, "", Object.values(runNumbers));
    let used = 0, rejected = 0;
    await tx(async (cl) => {
      for (const r of recs) {
        const m = merged.reasons.get(r.sku);
        if (!m) continue;
        if (m.source === "llm") used++;
        if (m.rejected) rejected++;
        await cl.query("update recommendations set reason = $1, reason_source = $2, rejected_ai_reason = $3 where run_id = $4 and sku = $5",
          [m.text, m.source === "llm" ? "gemini" : "template", m.rejected ?? null, runId, r.sku]);
      }
      if (merged.summary) await cl.query("update runs set summary = $1, summary_source = 'gemini' where id = $2", [merged.summary, runId]);
    });
    return { used, rejected, total: recs.length };
  } catch (e) {
    return { used: 0, rejected: 0, total: recs.length, error: (e as Error).message };
  }
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

export async function createRun(runDate: string, trigger: "schedule" | "manual") {
  const zohoWarning = await syncZohoOpenPos();
  const [settingsRow] = await query<{ settings: Settings }>("select settings from rule_settings where id = 1");
  const year = Number(runDate.slice(0, 4));
  const fest = await query<{ month: number }>("select month from festival_calendar where year = $1 and is_festival", [year]);
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...(settingsRow?.settings ?? {}),
    ...(fest.length ? { festivalMonths: fest.map((f) => f.month) } : {}),
  };

  const master = (await query<Record<string, unknown>>("select * from sku_master")).map<SkuMaster>((r) => ({
    sku: String(r.sku), name: String(r.name), category: String(r.category), perishable: Boolean(r.perishable),
    standardQty: Number(r.standard_qty), unitPrice: Number(r.unit_price), launchDate: iso(r.launch_date), active: Boolean(r.active),
  }));
  const sales = (await query<Record<string, unknown>>(
    "select week_start, sku, distributor_id, units from sales_weekly where week_start >= ($1::date - interval '24 weeks')",
    [runDate],
  )).map((r) => ({ weekStart: iso(r.week_start), sku: String(r.sku), distributorId: String(r.distributor_id), units: Number(r.units) }));
  const [snap] = await query<{ as_of: Date }>("select max(as_of) as as_of from stock_snapshots where as_of <= $1", [runDate]);
  const stockAsOf = snap?.as_of ? iso(snap.as_of) : null;
  const stock = stockAsOf
    ? (await query<Record<string, unknown>>("select sku, sum(on_hand)::int as on_hand from stock_snapshots where as_of = $1 group by sku", [stockAsOf]))
        .map((r) => ({ sku: String(r.sku), onHand: Number(r.on_hand) }))
    : [];
  const pos = (await query<Record<string, unknown>>("select po_number, sku, qty, eta from open_pos")).map((r) => ({
    poNumber: String(r.po_number), sku: String(r.sku), qty: Number(r.qty), eta: r.eta ? iso(r.eta) : "",
  }));

  const res = runPlanner(master, sales, stock, pos, runDate, settings);
  if (zohoWarning) res.issues.push({ level: "warn", message: zohoWarning });
  const blocked = res.issues.some((i) => i.level === "block");

  const created = await tx(async (c) => {
    const { rows } = await c.query(
      `insert into runs (run_date, trigger, last_complete_week, stock_as_of, festival, settings, status, counts, issues)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id, created_at`,
      [runDate, trigger, res.lastCompleteWeek, stockAsOf, res.festival, settings, blocked ? "blocked" : "ready", res.counts, JSON.stringify(res.issues)],
    );
    const runId = rows[0].id as string;
    for (const r of res.recommendations) {
      await c.query(
        `insert into recommendations (run_id, sku, status, recommended_qty, cover_weeks, rupees_at_risk, reason, detail)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [runId, r.sku, r.status, r.recommendedQty, r.coverWeeks, r.rupeesAtRisk, r.reason, r],
      );
    }
    return { runId, blocked, counts: res.counts, issues: res.issues, festival: res.festival, stockAsOf };
  });
  const ai = created.blocked ? null : await explainRun(created.runId);
  return { ...created, ai };
}

export async function getRun(runId?: string) {
  const [run] = runId
    ? await query("select * from runs where id = $1", [runId])
    : await query("select * from runs order by created_at desc limit 1");
  if (!run) return null;
  const id = (run as { id: string }).id;
  const recs = await query<{ detail: Recommendation; reason: string; reason_source: string }>(
    "select detail, reason, reason_source from recommendations where run_id = $1 order by case status when 'exception' then 0 when 'reorder_now' then 1 when 'reorder' then 2 when 'pause' then 3 when 'held' then 4 else 5 end, rupees_at_risk desc, sku",
    [id],
  );
  const decisions = await query("select sku, decision, final_qty, note, decided_by, decided_at from decisions where run_id = $1", [id]);
  const handoffs = await query("select id, line_count, total_units, sent_by, sent_at from handoffs where run_id = $1 order by sent_at desc", [id]);
  const distributors = await query("select s.sku, d.name, d.region, s.uom from sku_master s left join distributors d on d.id = s.distributor_id");
  const zohoPos = await query("select vendor_name, zoho_po_id, zoho_po_number, status, line_count, total_units, error, created_by, created_at from zoho_pos where run_id = $1 order by created_at", [id]);
  return {
    run, decisions, handoffs, distributors, zohoPos,
    recommendations: recs.map((r) => ({ ...r.detail, reason: r.reason, reasonSource: r.reason_source })),
  };
}

export type Decision = { sku: string; decision: "approved" | "edited" | "rejected" | "decided"; qty: number | null; note?: string; decidedBy: string };

export function validateDecision(d: Partial<Decision>): string | null {
  if (!d.sku) return "sku is required.";
  if (!d.decidedBy || !String(d.decidedBy).trim()) return "decidedBy is required.";
  if (!["approved", "edited", "rejected", "decided"].includes(String(d.decision))) return "decision must be approved, edited, rejected or decided.";
  if (d.decision !== "approved" && !(d.note && d.note.trim())) return "Add a note. Every edit, rejection and exception call needs a reason.";
  if (d.decision !== "rejected" && (d.qty === null || d.qty === undefined || !Number.isFinite(Number(d.qty)) || Number(d.qty) < 0)) return "Quantity must be 0 or more.";
  return null;
}

/** Approved reorder lines with their distributor, for Zoho draft POs. */
export async function approvedLines(runId: string) {
  return query<{ sku: string; name: string; qty: number; vendor: string; note: string | null }>(
    `select r.sku, s.name, d.final_qty as qty, coalesce(di.name, '') as vendor, d.note
       from decisions d join recommendations r on r.run_id = d.run_id and r.sku = d.sku
       join sku_master s on s.sku = r.sku left join distributors di on di.id = s.distributor_id
      where d.run_id = $1 and d.decision <> 'rejected' and coalesce(d.final_qty, 0) > 0 order by r.sku`,
    [runId],
  );
}

export async function buildHandoffCsv(runId: string) {
  const lines = await query<Record<string, unknown>>(
    `select r.sku, s.name, d.final_qty, d.decision, d.note, coalesce(di.name, '') as distributor, r.cover_weeks
       from decisions d join recommendations r on r.run_id = d.run_id and r.sku = d.sku
       join sku_master s on s.sku = r.sku left join distributors di on di.id = s.distributor_id
      where d.run_id = $1 and d.decision <> 'rejected' order by r.sku`,
    [runId],
  );
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = ["sku,name,action,qty,distributor,weeks_of_cover,decision,note",
    ...lines.map((l) => [l.sku, l.name, Number(l.final_qty) > 0 ? "Reorder" : "Pause next order", l.final_qty, l.distributor, l.cover_weeks, l.decision, l.note].map(esc).join(","))].join("\n") + "\n";
  const buy = lines.filter((l) => Number(l.final_qty) > 0);
  return { csv, lineCount: buy.length, totalUnits: buy.reduce((a, l) => a + Number(l.final_qty), 0) };
}
