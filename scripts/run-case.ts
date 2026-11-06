// Run the planner on the MESA case files. Usage: npx tsx scripts/run-case.ts [dir=data/case] [runDate=2026-10-22]
import { writeFileSync } from "node:fs";
import { runPlanner } from "../src/engine/engine";
import { DEFAULT_SETTINGS } from "../src/engine/types";
import { readCase } from "../src/io/case";

const dir = process.argv[2] ?? "data/case";
const runDate = process.argv[3] ?? "2026-10-22";
const c = readCase(dir);
const year = Number(runDate.slice(0, 4));
const settings = { ...DEFAULT_SETTINGS, festivalMonths: c.festivalMonthsByYear[year] ?? DEFAULT_SETTINGS.festivalMonths };
const res = runPlanner(c.master, c.sales, c.stock, [], runDate, settings);
for (const i of res.issues) console.log(`[${i.level}] ${i.message}`);
console.log(`Run ${runDate} · last complete week ${res.lastCompleteWeek} · festival ${res.festival} · stock as of ${c.stockAsOf}`);
console.table(res.recommendations.map((r) => ({
  sku: r.sku, name: r.name.replace("Freshroots ", ""), per: r.perishable ? "High" : "Low", status: r.status,
  avg4: r.avg4, avg12: r.avg12, demand: r.demand, onHand: r.onHand, cover: r.coverWeeks, win: `${r.window.min}-${r.window.max}`,
  qty: r.recommendedQty, rules: r.rules.join("+"),
})));
console.log(res.counts);
writeFileSync(`${dir}/run-${runDate}.json`, JSON.stringify(res, null, 2));
