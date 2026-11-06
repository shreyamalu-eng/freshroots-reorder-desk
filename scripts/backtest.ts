// Phase 3: replay the rules on past weeks to see if they would have caught real stockouts early.
// Needs a weekly stock history from SAP: week_start, sku, on_hand (stock at the end of that week).
// Open PO history is usually not available, so this assumes nothing was on order (a conservative test).
// Usage: npx tsx scripts/backtest.ts <dataDir> <firstRunDate> <lastRunDate> [leadWeeks=2]
import { readFileSync, writeFileSync } from "node:fs";
import { parseISO, runPlanner, toISO, weekStartOf } from "../src/engine/engine";
import { parseCsv, readSales, readSkuMaster, toCsv } from "../src/io/csv";

const [dataDir = "data/sample", first, lastArg, leadArg] = process.argv.slice(2);
if (!first || !lastArg) {
  console.log("Usage: npx tsx scripts/backtest.ts <dataDir> <firstRunDate> <lastRunDate> [leadWeeks=2]");
  process.exit(1);
}
const lead = Number(leadArg ?? 2);
const master = readSkuMaster(`${dataDir}/sku_master.csv`);
const sales = readSales(`${dataDir}/sap_sales_weekly.csv`);
const hist = parseCsv(readFileSync(`${dataDir}/sap_stock_history.csv`, "utf8")).map((r) => ({ week: r.week_start, sku: r.sku, onHand: Number(r.on_hand) }));
const stockAt = new Map<string, Map<string, number>>();
for (const h of hist) {
  if (!stockAt.has(h.week)) stockAt.set(h.week, new Map());
  stockAt.get(h.week)!.set(h.sku, h.onHand);
}

// Stockout events: the first week a SKU ends at zero stock (consecutive zero weeks count once).
const prev = new Map<string, number>();
const stockouts: { sku: string; week: string }[] = [];
for (const h of [...hist].sort((a, b) => a.week.localeCompare(b.week))) {
  if (h.onHand <= 0 && (prev.get(h.sku) ?? 1) > 0) stockouts.push({ sku: h.sku, week: h.week });
  prev.set(h.sku, h.onHand);
}

// Replay Monday and Thursday runs.
const DAY = 86_400_000;
const flaggedBy = new Map<string, string[]>(); // sku -> run dates where R2 fired
const perRun: Record<string, unknown>[] = [];
for (let t = parseISO(first); t <= parseISO(lastArg); t += DAY) {
  const dow = new Date(t).getUTCDay();
  if (dow !== 1 && dow !== 4) continue;
  const runDate = toISO(t);
  const snapWeek = toISO(parseISO(weekStartOf(runDate)) - 7 * DAY);
  const snap = stockAt.get(snapWeek);
  if (!snap) continue;
  const salesUpTo = sales.filter((s) => s.weekStart <= snapWeek);
  const res = runPlanner(master, salesUpTo, [...snap].map(([sku, onHand]) => ({ sku, onHand })), [], runDate);
  for (const r of res.recommendations) {
    if (r.rules.includes("R2_stockout_risk")) {
      if (!flaggedBy.has(r.sku)) flaggedBy.set(r.sku, []);
      flaggedBy.get(r.sku)!.push(runDate);
    }
  }
  perRun.push({ run_date: runDate, blocked: res.issues.some((i) => i.level === "block"), ...res.counts });
}

// Did a flag fire at least `lead` weeks before each stockout?
let caught = 0;
const detail = stockouts.map((s) => {
  const deadline = toISO(parseISO(s.week) - lead * 7 * DAY);
  const early = (flaggedBy.get(s.sku) ?? []).filter((d) => d <= deadline && d >= toISO(parseISO(s.week) - 8 * 7 * DAY));
  if (early.length) caught++;
  return { sku: s.sku, stockout_week: s.week, flagged_early: early.length > 0, first_flag: early[0] ?? "" };
});
writeFileSync(`${dataDir}/backtest-runs.csv`, toCsv(perRun));
writeFileSync(`${dataDir}/backtest-stockouts.csv`, toCsv(detail));
const rate = stockouts.length ? Math.round((caught / stockouts.length) * 100) : 0;
console.log(`${perRun.length} replayed runs. ${stockouts.length} stockout weeks; ${caught} (${rate}%) were flagged at least ${lead} weeks ahead.`);
console.log(`Wrote ${dataDir}/backtest-runs.csv and backtest-stockouts.csv`);
