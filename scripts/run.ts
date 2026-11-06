// One planning run, end to end, from files (steps 3-14 of the components map).
// Usage: npx tsx scripts/run.ts [dataDir=data/sample] [runDate=today] [outDir=out]
// The web app's cron route calls the same functions; only the input/output adapters change.
import { mkdirSync, writeFileSync } from "node:fs";
import { runPlanner } from "../src/engine/engine";
import { buildExplainUserMessage, mergeExplanations } from "../src/engine/explain";
import { DEFAULT_SETTINGS } from "../src/engine/types";
import { readOpenPOs, readSales, readSkuMaster, readStock, writeCsv } from "../src/io/csv";
import { callClaude } from "../src/pipeline/claude";

const dataDir = process.argv[2] ?? "data/sample";
const runDate = process.argv[3] ?? new Date().toISOString().slice(0, 10);
const outDir = process.argv[4] ?? "out";
mkdirSync(outDir, { recursive: true });

const t0 = Date.now();
const result = runPlanner(
  readSkuMaster(`${dataDir}/sku_master.csv`),
  readSales(`${dataDir}/sap_sales_weekly.csv`),
  readStock(`${dataDir}/sap_stock.csv`),
  readOpenPOs(`${dataDir}/zoho_open_pos.csv`),
  runDate,
  DEFAULT_SETTINGS,
);
for (const i of result.issues) console.log(`[${i.level}] ${i.message}`);
if (result.issues.some((i) => i.level === "block")) {
  console.log("Run blocked. Nothing was planned.");
  process.exit(2);
}

const c = result.counts;
const action = c.reorder_now + c.reorder + c.pause;
const atRisk = result.recommendations.reduce((a, r) => a + r.rupeesAtRisk, 0);
const lakhs = Math.round(atRisk / 1e4) / 10;
const fallbackSummary =
  `${action + c.exception} SKUs need a decision: ${c.reorder_now} to reorder now, ${c.reorder} to reorder, ${c.pause} to pause and ${c.exception} exceptions for you.` +
  ` ${c.held} SKUs are held back for data fixes.` +
  (result.festival ? " The festival uplift is on." : "");
const runNumbers = [action + c.exception, c.reorder_now, c.reorder, c.pause, c.exception, c.held, c.ok, result.recommendations.length, lakhs, 25];

const queue = result.recommendations.filter((r) => r.status !== "ok");
const modelText = await callClaude(buildExplainUserMessage(queue, Object.fromEntries(
  ["needs_decision", "reorder_now", "reorder", "pause", "exceptions", "held", "no_action", "skus_planned", "lakhs_at_risk"].map((k, i) => [k, runNumbers[i]]),
)));
const explained = mergeExplanations(queue, modelText, fallbackSummary, runNumbers);
const llmUsed = [...explained.reasons.values()].filter((r) => r.source === "llm").length;
const rejected = [...explained.reasons.values()].filter((r) => r.rejected).length;

const stamp = runDate;
writeFileSync(`${outDir}/run-${stamp}.json`, JSON.stringify({ ...result, summary: explained.summary, reasons: Object.fromEntries(explained.reasons) }, null, 2));
writeCsv(`${outDir}/review-queue-${stamp}.csv`, queue.map((r) => ({
  sku: r.sku, name: r.name, status: r.status, rules: r.rules.join("+"), perishable: r.perishable,
  avg_4wk: r.avg4, avg_12wk: r.avg12, weekly_demand_used: r.demand, on_hand: r.onHand, on_order: r.onOrder,
  weeks_of_cover: r.coverWeeks, window: `${r.window.min}-${r.window.max}`, recommended_qty: r.recommendedQty,
  suggested_qty: r.suggestedQty, rupees_at_risk: r.rupeesAtRisk, reason: explained.reasons.get(r.sku)?.text ?? r.reason,
})));
writeFileSync(
  `${outDir}/email-raghav-${stamp}.txt`,
  `Subject: ${new Date(runDate).toLocaleDateString("en-IN", { weekday: "long" })} run: ${action} flags, ${c.exception} exceptions\n\n` +
    `${explained.summary}\n\nTop of the queue:\n` +
    queue.slice(0, 5).map((r) => `- ${r.sku} ${r.name}: ${explained.reasons.get(r.sku)?.text}`).join("\n") +
    `\n\nOpen the review queue: {{APP_URL}}/runs/${stamp}\n`,
);

console.log(`Run ${runDate} (last complete week ${result.lastCompleteWeek}, festival uplift ${result.festival ? "on" : "off"})`);
console.log(`Planned ${result.recommendations.length} SKUs in ${Date.now() - t0} ms.`, c);
console.log(`Reasons: ${llmUsed} from Claude, ${queue.length - llmUsed} from templates${rejected ? `, ${rejected} model reasons rejected by the number check` : ""}.`);
console.log(`Wrote ${outDir}/run-${stamp}.json, review-queue-${stamp}.csv, email-raghav-${stamp}.txt`);
