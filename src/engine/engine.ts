// Freshroots demand planner: rules engine.
// Pure functions only. No network, no database, no clock. Same input, same output.
// Rules R1-R5 come from Raghav Kulkarni's documented forecasting logic.

import {
  DEFAULT_SETTINGS,
  type DistributorSwing,
  type OpenPO,
  type Recommendation,
  type RuleId,
  type RunIssue,
  type RunResult,
  type SalesRow,
  type Settings,
  type SkuInput,
  type SkuMaster,
  type Status,
  type StockRow,
} from "./types";

const DAY = 86_400_000;
const TREND_WEEKS = 16;

// ---------- dates ----------

export function parseISO(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}
export function toISO(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}
/** Monday of the week containing `d`. */
export function weekStartOf(d: string): string {
  const t = parseISO(d);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return toISO(t - dow * DAY);
}
/** The last complete week before the run date (the week that started 7 days before this week's Monday). */
export function lastCompleteWeek(runDate: string): string {
  return toISO(parseISO(weekStartOf(runDate)) - 7 * DAY);
}
/** `n` week-start dates ending at `lastWeek`, oldest first. */
export function weekRange(lastWeek: string, n: number): string[] {
  const end = parseISO(lastWeek);
  return Array.from({ length: n }, (_, i) => toISO(end - (n - 1 - i) * 7 * DAY));
}
function monthOf(d: string): number {
  return Number(d.slice(5, 7));
}

// ---------- maths ----------

const round1 = (x: number) => Math.round(x * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ---------- step 7: aggregate SAP rows to SKU level ----------

export interface AggregateOutput {
  inputs: SkuInput[];
  issues: RunIssue[];
}

export function aggregate(
  master: SkuMaster[],
  sales: SalesRow[],
  stock: StockRow[],
  openPOs: OpenPO[],
  runDate: string,
  settings: Settings = DEFAULT_SETTINGS,
): AggregateOutput {
  const issues: RunIssue[] = [];
  const last = lastCompleteWeek(runDate);
  const nWeeks = Math.max(TREND_WEEKS, settings.minHistoryWeeks);
  const weeks = weekRange(last, nWeeks);
  const weekIdx = new Map(weeks.map((w, i) => [w, i]));
  const masterBySku = new Map(master.map((m) => [m.sku, m]));

  // Step 6 (file level): every one of the last 12 weeks must be present in the export.
  const weeksSeen = new Set(sales.map((r) => r.weekStart));
  const needed = weeks.slice(-settings.minHistoryWeeks);
  const missing = needed.filter((w) => !weeksSeen.has(w));
  if (missing.length) {
    issues.push({
      level: "block",
      message: `The SAP sales export has no rows for week(s) ${missing.join(", ")}. The run stops so no SKU is planned on a gap.`,
    });
  }
  const unknown = new Set<string>();
  const total = new Map<string, number[]>();
  // per SKU -> distributor -> weekly units
  const byDist = new Map<string, Map<string, number[]>>();

  for (const r of sales) {
    const i = weekIdx.get(r.weekStart);
    if (i === undefined) continue; // outside the window
    if (!masterBySku.has(r.sku)) {
      unknown.add(r.sku);
      continue;
    }
    if (!total.has(r.sku)) total.set(r.sku, new Array(weeks.length).fill(0));
    total.get(r.sku)![i] += r.units;
    if (!byDist.has(r.sku)) byDist.set(r.sku, new Map());
    const dm = byDist.get(r.sku)!;
    if (!dm.has(r.distributorId)) dm.set(r.distributorId, new Array(weeks.length).fill(0));
    dm.get(r.distributorId)![i] += r.units;
  }
  if (unknown.size) {
    issues.push({
      level: "warn",
      message: `${unknown.size} SKU code(s) in the SAP export are not in the SKU master and were skipped: ${[...unknown].slice(0, 10).join(", ")}${unknown.size > 10 ? "…" : ""}`,
    });
  }

  const stockBySku = new Map<string, number>();
  for (const s of stock) stockBySku.set(s.sku, (stockBySku.get(s.sku) ?? 0) + s.onHand);
  const onOrderBySku = new Map<string, number>();
  for (const p of openPOs) onOrderBySku.set(p.sku, (onOrderBySku.get(p.sku) ?? 0) + p.qty);

  const lastT = parseISO(last);
  const inputs: SkuInput[] = master
    .filter((m) => m.active)
    .map((m) => {
      const weekly = total.get(m.sku) ?? new Array(weeks.length).fill(0);
      const launchT = parseISO(m.launchDate);
      const historyWeeks = Math.max(0, Math.min(weeks.length, Math.floor((lastT - weekStartOfT(launchT)) / (7 * DAY)) + 1));
      return {
        master: m,
        weeks,
        weekly,
        onHand: stockBySku.has(m.sku) ? stockBySku.get(m.sku)! : null,
        onOrder: onOrderBySku.get(m.sku) ?? 0,
        historyWeeks,
        swings: findSwings(byDist.get(m.sku), weekly, settings),
      };
    });
  return { inputs, issues };
}

function weekStartOfT(t: number): number {
  return parseISO(weekStartOf(toISO(t)));
}

/** Step 9 (part): distributors that carry real volume and moved sharply in the last 4 weeks. */
export function findSwings(
  dists: Map<string, number[]> | undefined,
  skuWeekly: number[],
  settings: Settings,
): DistributorSwing[] {
  if (!dists) return [];
  const skuTotal12 = skuWeekly.slice(-12).reduce((a, b) => a + b, 0);
  if (skuTotal12 <= 0) return [];
  const out: DistributorSwing[] = [];
  for (const [distributorId, w] of dists) {
    const last12 = w.slice(-12);
    const share = last12.reduce((a, b) => a + b, 0) / skuTotal12;
    if (share < settings.distributorMinShare) continue;
    const avg12 = mean(last12);
    const avg4 = mean(w.slice(-4));
    if (avg12 <= 0) continue;
    const change = avg4 / avg12 - 1;
    if (Math.abs(change) >= settings.distributorSwingPct) {
      out.push({ distributorId, share: round1(share * 100) / 100, avg4: round1(avg4), avg12: round1(avg12), change: Math.round(change * 100) / 100 });
    }
  }
  return out.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

// ---------- steps 8-10: apply the rules to one SKU ----------

export function evaluate(input: SkuInput, runDate: string, settings: Settings = DEFAULT_SETTINGS): Recommendation {
  const m = input.master;
  const last12 = input.weekly.slice(-12);
  const avg12 = mean(last12);
  const avg4 = mean(input.weekly.slice(-4));
  const festival = settings.festivalMonths.includes(monthOf(runDate));
  // R4: uplift applied to expected weekly demand before any threshold check.
  const demand = avg12 * (festival ? 1 + settings.festivalUplift : 1);
  // R5: perishable SKUs use a tighter window.
  const window = m.perishable
    ? { min: settings.perishableMinWeeks, max: settings.perishableMaxWeeks }
    : { min: settings.stockoutWeeks, max: settings.overstockWeeks };

  const base = {
    sku: m.sku,
    name: m.name,
    category: m.category,
    perishable: m.perishable,
    festival,
    avg4: round1(avg4),
    avg12: round1(avg12),
    demand: round1(demand),
    onHand: input.onHand,
    onOrder: input.onOrder,
    window,
    standardQty: m.standardQty,
    trend: input.weekly.slice(-TREND_WEEKS),
  };

  // Step 6 (SKU level): hold back SKUs with bad or missing stock data.
  const held: string[] = [];
  if (input.onHand === null) held.push("No stock row for this SKU in the SAP stock export.");
  else if (input.onHand < 0) held.push(`SAP shows negative stock (${input.onHand} units).`);
  if (held.length) {
    const rec: Recommendation = {
      ...base,
      status: "held",
      rules: [],
      coverWeeks: null,
      recommendedQty: null,
      suggestedQty: null,
      rupeesAtRisk: 0,
      exceptionReasons: [],
      heldReasons: held,
      reason: "",
    };
    rec.reason = templateReason(rec, settings);
    return rec;
  }

  const pipeline = input.onHand! + input.onOrder;
  const coverWeeks = demand > 0 ? round1(pipeline / demand) : null;

  // R1-R3
  const rules: RuleId[] = [];
  const r1 = avg12 > 0 && avg4 > avg12 * (1 + settings.highDemandPct);
  if (r1) rules.push("R1_high_demand");
  const r2 = coverWeeks !== null && coverWeeks < window.min;
  if (r2) rules.push("R2_stockout_risk");
  // No sales in 12 weeks but stock on hand counts as overstock.
  const r3 = (coverWeeks !== null && coverWeeks > window.max) || (demand === 0 && pipeline > 0);
  if (r3) rules.push("R3_overstock_risk");

  // Step 9: exceptions go to Raghav instead of being decided by the rules.
  const exceptions: string[] = [];
  if (input.historyWeeks < settings.minHistoryWeeks) {
    exceptions.push(`New launch: only ${input.historyWeeks} week(s) of history, the rules need ${settings.minHistoryWeeks}.`);
  }
  for (const s of input.swings) {
    exceptions.push(
      `Distributor ${s.distributorId} (${Math.round(s.share * 100)}% of volume) moved ${s.change > 0 ? "+" : ""}${Math.round(s.change * 100)}% in the last 4 weeks.`,
    );
  }
  if (r1 && r3) exceptions.push("Rules disagree: demand is up but stock is already above the maximum.");

  // Quantity from the rule combination.
  const std = m.standardQty;
  let qty: number | null = null;
  let ruleStatus: Status = "ok";
  if (r1 && r3) {
    qty = null;
    ruleStatus = "exception";
  } else if (r2) {
    qty = Math.round(std * (r1 ? settings.highDemandMultiplier : 1));
    ruleStatus = "reorder_now";
  } else if (r1) {
    qty = Math.round(std * settings.highDemandMultiplier);
    ruleStatus = "reorder";
  } else if (r3) {
    qty = 0;
    ruleStatus = "pause";
  }

  const rupeesAtRisk = Math.round(riskUnits({ r1, r2, r3, coverWeeks, demand, avg4, avg12, window, pipeline }) * m.unitPrice);
  const isException = exceptions.length > 0;
  const rec: Recommendation = {
    ...base,
    status: isException ? "exception" : ruleStatus,
    rules,
    coverWeeks,
    recommendedQty: isException ? null : qty,
    suggestedQty: isException ? qty : null,
    rupeesAtRisk: isException && rupeesAtRisk === 0 ? Math.round(demand * window.min * m.unitPrice) : rupeesAtRisk,
    exceptionReasons: exceptions,
    heldReasons: [],
    reason: "",
  };
  rec.reason = templateReason(rec, settings);
  return rec;
}

/** Units at risk, used only to sort the queue. Stockout: units short of the minimum. Overstock: units above the maximum. */
function riskUnits(x: {
  r1: boolean; r2: boolean; r3: boolean; coverWeeks: number | null; demand: number; avg4: number; avg12: number;
  window: { min: number; max: number }; pipeline: number;
}): number {
  if (x.r2 && x.coverWeeks !== null) return (x.window.min - x.coverWeeks) * x.demand;
  if (x.r3) return x.coverWeeks === null ? x.pipeline : (x.coverWeeks - x.window.max) * x.demand;
  if (x.r1) return (x.avg4 - x.avg12) * x.window.min;
  return 0;
}

// ---------- deterministic reasons (fallback for the LLM, step 12) ----------

const fmt = (n: number) => n.toLocaleString("en-IN");

export function templateReason(r: Recommendation, s: Settings = DEFAULT_SETTINGS): string {
  const uplift = r.festival ? ` Includes the ${Math.round(s.festivalUplift * 100)}% festival uplift.` : "";
  const per = r.perishable ? " (perishable window)" : "";
  const pct = r.avg12 > 0 ? Math.round((r.avg4 / r.avg12 - 1) * 100) : 0;
  const cover = r.coverWeeks === null ? "no measurable" : `${r.coverWeeks}`;
  switch (r.status) {
    case "held":
      return `Held back: ${r.heldReasons.join(" ")} Fix the data before planning this SKU.`;
    case "exception":
      return `Needs your call: ${r.exceptionReasons.join(" ")}${r.suggestedQty !== null ? ` Rules alone would suggest ${fmt(r.suggestedQty)} units.` : ""}`;
    case "reorder_now":
      return `Stock and open orders cover ${cover} weeks, below the ${r.window.min}-week minimum${per}.${r.rules.includes("R1_high_demand") ? ` Last 4 weeks are ${pct}% above the 12-week average.` : ""} Reorder ${fmt(r.recommendedQty!)} units now.${uplift}`;
    case "reorder":
      return `Last 4 weeks average ${fmt(r.avg4)} units, ${pct}% above the 12-week average of ${fmt(r.avg12)}. Reorder ${fmt(r.recommendedQty!)} units (${s.highDemandMultiplier}x standard).${uplift}`;
    case "pause":
      return r.coverWeeks === null
        ? `No sales in 12 weeks with ${fmt(r.onHand! + r.onOrder)} units in stock or on order. Pause the next order.`
        : `Stock and open orders cover ${cover} weeks, above the ${r.window.max}-week maximum${per}. Pause the next order.${uplift}`;
    default:
      return `Cover of ${cover} weeks is inside the ${r.window.min}–${r.window.max} week window. No action.`;
  }
}

// ---------- the whole run ----------

const STATUS_ORDER: Status[] = ["exception", "reorder_now", "reorder", "pause", "held", "ok"];

export function runPlanner(
  master: SkuMaster[],
  sales: SalesRow[],
  stock: StockRow[],
  openPOs: OpenPO[],
  runDate: string,
  settings: Settings = DEFAULT_SETTINGS,
): RunResult {
  const { inputs, issues } = aggregate(master, sales, stock, openPOs, runDate, settings);
  const blocked = issues.some((i) => i.level === "block");
  const recommendations = blocked ? [] : sortQueue(inputs.map((i) => evaluate(i, runDate, settings)));
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<Status, number>;
  for (const r of recommendations) counts[r.status]++;
  return {
    runDate,
    lastCompleteWeek: lastCompleteWeek(runDate),
    festival: settings.festivalMonths.includes(monthOf(runDate)),
    settings,
    recommendations,
    issues,
    counts,
  };
}

/** Review queue order: exceptions first, then by status, then by rupees at risk. */
export function sortQueue(recs: Recommendation[]): Recommendation[] {
  return [...recs].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.rupeesAtRisk - a.rupeesAtRisk || a.sku.localeCompare(b.sku),
  );
}
