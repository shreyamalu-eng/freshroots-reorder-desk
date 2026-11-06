import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregate, evaluate, findSwings, lastCompleteWeek, runPlanner, sortQueue, weekRange, weekStartOf,
} from "../src/engine/engine";
import { allowedNumbers, mergeExplanations, numbersIn, validateReason } from "../src/engine/explain";
import { DEFAULT_SETTINGS, type SkuInput, type SkuMaster } from "../src/engine/types";

const S = DEFAULT_SETTINGS;
const NOV_OFF = "2026-02-12"; // a Thursday in a non-festival month
const OCT = "2026-10-22"; // a Thursday in a festival month

function master(over: Partial<SkuMaster> = {}): SkuMaster {
  return { sku: "SKU-T", name: "Test namkeen 200g", category: "Namkeen", perishable: false, standardQty: 1000, unitPrice: 40, launchDate: "2023-01-02", active: true, ...over };
}
function input(weekly12: number[], onHand: number | null, over: Partial<SkuInput> = {}, m: Partial<SkuMaster> = {}): SkuInput {
  const weekly = [...new Array(16 - weekly12.length).fill(weekly12[0]), ...weekly12];
  return { master: master(m), weeks: weekRange("2026-02-02", 16), weekly, onHand, onOrder: 0, historyWeeks: 16, swings: [], ...over };
}
const flat = (v: number) => new Array(12).fill(v);

test("week helpers find Monday and the last complete week", () => {
  assert.equal(weekStartOf("2026-10-22"), "2026-10-19");
  assert.equal(weekStartOf("2026-10-19"), "2026-10-19");
  assert.equal(lastCompleteWeek("2026-10-22"), "2026-10-12");
  assert.deepEqual(weekRange("2026-10-12", 3), ["2026-09-28", "2026-10-05", "2026-10-12"]);
});

// The three test inputs from the build checklist: one clearly strong, one clearly weak, one ambiguous.
test("STRONG: 3 weeks of cover on a standard SKU is a stockout risk, reorder standard qty now", () => {
  const r = evaluate(input(flat(100), 300), NOV_OFF);
  assert.equal(r.coverWeeks, 3);
  assert.equal(r.status, "reorder_now");
  assert.deepEqual(r.rules, ["R2_stockout_risk"]);
  assert.equal(r.recommendedQty, 1000);
  assert.ok(r.rupeesAtRisk > 0);
});

test("WEAK: 10 weeks of cover with flat demand needs no action", () => {
  const r = evaluate(input(flat(100), 1000), NOV_OFF);
  assert.equal(r.status, "ok");
  assert.equal(r.recommendedQty, null);
  assert.equal(r.rules.length, 0);
});

test("AMBIGUOUS: demand up 40% but stock already above maximum goes to Raghav, no quantity", () => {
  const weekly = [...new Array(8).fill(100), ...new Array(4).fill(160)];
  const r = evaluate(input(weekly, 3000), NOV_OFF);
  assert.deepEqual(r.rules, ["R1_high_demand", "R3_overstock_risk"]);
  assert.equal(r.status, "exception");
  assert.equal(r.recommendedQty, null);
  assert.equal(r.suggestedQty, null);
  assert.match(r.exceptionReasons.join(" "), /Rules disagree/);
});

test("R1: more than 20% above the 12-week average reorders at 1.5x standard", () => {
  const weekly = [...new Array(8).fill(100), ...new Array(4).fill(140)];
  const r = evaluate(input(weekly, 1100), NOV_OFF);
  assert.ok(r.rules.includes("R1_high_demand"));
  assert.equal(r.status, "reorder");
  assert.equal(r.recommendedQty, 1500);
});

test("R1 boundary: exactly 20% above is not flagged", () => {
  const weekly = [...new Array(8).fill(90), ...new Array(4).fill(120)]; // avg12 = 100, avg4 = 120
  const r = evaluate(input(weekly, 1000), NOV_OFF);
  assert.equal(r.avg12, 100);
  assert.ok(!r.rules.includes("R1_high_demand"));
});

test("R1 + R2: stockout risk with rising demand reorders 1.5x now", () => {
  const weekly = [...new Array(8).fill(100), ...new Array(4).fill(150)];
  const r = evaluate(input(weekly, 300), NOV_OFF);
  assert.equal(r.status, "reorder_now");
  assert.equal(r.recommendedQty, 1500);
});

test("R3: more than 14 weeks of cover pauses the next order", () => {
  const r = evaluate(input(flat(100), 2000), NOV_OFF);
  assert.equal(r.coverWeeks, 20);
  assert.equal(r.status, "pause");
  assert.equal(r.recommendedQty, 0);
});

test("R4: festival uplift is applied before thresholds (6.5 weeks becomes 5.2 in October)", () => {
  const off = evaluate(input(flat(100), 650), NOV_OFF);
  const fest = evaluate(input(flat(100), 650), OCT);
  assert.equal(off.status, "ok");
  assert.equal(off.coverWeeks, 6.5);
  assert.equal(fest.festival, true);
  assert.equal(fest.demand, 125);
  assert.equal(fest.coverWeeks, 5.2);
  assert.equal(fest.status, "reorder_now");
  assert.match(fest.reason, /25% festival uplift/);
});

test("R4: March is a festival month, January is not", () => {
  assert.equal(evaluate(input(flat(100), 650), "2026-03-12").festival, true);
  assert.equal(evaluate(input(flat(100), 650), "2026-01-15").festival, false);
});

test("R5: the same 5 weeks of cover is overstock for a perishable and stockout risk for a standard SKU", () => {
  const per = evaluate(input(flat(100), 500, {}, { perishable: true }), NOV_OFF);
  const std = evaluate(input(flat(100), 500), NOV_OFF);
  assert.deepEqual(per.window, { min: 3, max: 4 });
  assert.equal(per.status, "pause");
  assert.equal(std.status, "reorder_now");
});

test("R5: perishable below 3 weeks reorders now", () => {
  const r = evaluate(input(flat(100), 250, {}, { perishable: true }), NOV_OFF);
  assert.equal(r.status, "reorder_now");
});

test("Open POs count toward cover, so stock already ordered is not reordered", () => {
  const r = evaluate(input(flat(100), 300, { onOrder: 500 }), NOV_OFF);
  assert.equal(r.coverWeeks, 8);
  assert.equal(r.status, "ok");
});

test("New launch with under 12 weeks of history is an exception with a suggested quantity", () => {
  const r = evaluate(input(flat(100), 300, { historyWeeks: 6 }), NOV_OFF);
  assert.equal(r.status, "exception");
  assert.equal(r.recommendedQty, null);
  assert.equal(r.suggestedQty, 1000);
  assert.match(r.exceptionReasons[0], /New launch/);
});

test("Held: missing or negative stock never gets a recommendation", () => {
  const a = evaluate(input(flat(100), null), NOV_OFF);
  const b = evaluate(input(flat(100), -40), NOV_OFF);
  assert.equal(a.status, "held");
  assert.equal(b.status, "held");
  assert.equal(b.recommendedQty, null);
  assert.match(b.reason, /negative stock/);
});

test("No sales in 12 weeks: stock on hand pauses, no stock means no action", () => {
  assert.equal(evaluate(input(flat(0), 400), NOV_OFF).status, "pause");
  assert.equal(evaluate(input(flat(0), 0), NOV_OFF).status, "ok");
});

test("Distributor swing: a big distributor dropping 50% is detected, a small one is ignored", () => {
  const big = [...new Array(12).fill(40), ...new Array(4).fill(20)]; // 16 weeks
  const small = [...new Array(12).fill(2), ...new Array(4).fill(0)];
  const rest = new Array(16).fill(100);
  const sku = big.map((v, i) => v + small[i] + rest[i]);
  const swings = findSwings(new Map([["D-BIG", big], ["D-SMALL", small], ["D-REST", rest]]), sku, S);
  assert.equal(swings.length, 1);
  assert.equal(swings[0].distributorId, "D-BIG");
  assert.ok(swings[0].change <= -0.4);
});

test("aggregate: rolls distributors up, sums open POs, blocks on a missing week, warns on unknown SKUs", () => {
  const runDate = OCT;
  const weeks = weekRange(lastCompleteWeek(runDate), 16);
  const sales = weeks.flatMap((w) => [
    { weekStart: w, distributorId: "D1", sku: "SKU-T", units: 60 },
    { weekStart: w, distributorId: "D2", sku: "SKU-T", units: 40 },
  ]);
  sales.push({ weekStart: weeks[15], distributorId: "D1", sku: "SKU-UNKNOWN", units: 5 });
  const ok = aggregate([master()], sales, [{ sku: "SKU-T", onHand: 500 }], [{ sku: "SKU-T", poNumber: "PO1", qty: 200, eta: "2026-10-30" }, { sku: "SKU-T", poNumber: "PO2", qty: 100, eta: "2026-11-05" }], runDate);
  assert.equal(ok.inputs[0].weekly[15], 100);
  assert.equal(ok.inputs[0].onOrder, 300);
  assert.equal(ok.inputs[0].historyWeeks, 16);
  assert.ok(ok.issues.some((i) => i.level === "warn" && /SKU-UNKNOWN/.test(i.message)));
  assert.ok(!ok.issues.some((i) => i.level === "block"));

  const gap = aggregate([master()], sales.filter((r) => r.weekStart !== weeks[13]), [], [], runDate);
  assert.ok(gap.issues.some((i) => i.level === "block"));
  const run = runPlanner([master()], sales.filter((r) => r.weekStart !== weeks[13]), [], [], runDate);
  assert.equal(run.recommendations.length, 0, "a blocked run must not produce recommendations");
});

test("aggregate: launch date sets history weeks", () => {
  const runDate = OCT;
  const weeks = weekRange(lastCompleteWeek(runDate), 16);
  const sales = weeks.map((w) => ({ weekStart: w, distributorId: "D1", sku: "SKU-T", units: 10 }));
  const agg = aggregate([master({ launchDate: weeks[10] })], sales, [{ sku: "SKU-T", onHand: 10 }], [], runDate);
  assert.equal(agg.inputs[0].historyWeeks, 6);
});

test("Same input gives the same output every time", () => {
  const a = evaluate(input(flat(100), 300), OCT);
  const b = evaluate(input(flat(100), 300), OCT);
  assert.deepEqual(a, b);
});

test("Queue order: exceptions first, then reorder now, then by rupees at risk", () => {
  const recs = [
    evaluate(input(flat(100), 2000), NOV_OFF),
    evaluate(input(flat(100), 300), NOV_OFF),
    evaluate(input(flat(100), 300, { historyWeeks: 3 }), NOV_OFF),
    evaluate(input(flat(100), 100), NOV_OFF),
  ];
  const q = sortQueue(recs).map((r) => `${r.status}:${r.coverWeeks}`);
  assert.deepEqual(q, ["exception:3", "reorder_now:1", "reorder_now:3", "pause:20"]);
});

test("Explanation check: allowed numbers pass, invented numbers fall back to the template", () => {
  const r = evaluate(input(flat(100), 300), NOV_OFF);
  assert.deepEqual(numbersIn("Reorder 1,250 units, cover 6.5 weeks, up 25%"), [1250, 6.5, 25]);
  assert.ok(validateReason("Stock covers 3 weeks against a 6-week minimum; reorder 1,000 units now.", allowedNumbers(r)).ok);
  const bad = validateReason("Stock covers 3 weeks; reorder 1,200 units now.", allowedNumbers(r));
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.bad, [1200]);

  const json = JSON.stringify({ items: [{ sku: "SKU-T", reason: "Reorder 1,200 units now." }], summary: "7 SKUs need action." });
  const merged = mergeExplanations([r], json, "fallback summary", [1]);
  assert.equal(merged.reasons.get("SKU-T")!.source, "template");
  assert.equal(merged.reasons.get("SKU-T")!.text, r.reason);
  assert.equal(merged.summary, "fallback summary", "a summary quoting a number not in the run must be rejected");

  const good = mergeExplanations([r], "```json\n" + JSON.stringify({ items: [{ sku: "SKU-T", reason: "Only 3 weeks of cover left; reorder 1,000 units now." }], summary: "1 SKU needs action." }) + "\n```", "x", [1]);
  assert.equal(good.reasons.get("SKU-T")!.source, "llm");
  assert.equal(good.summary, "1 SKU needs action.");
  assert.equal(mergeExplanations([r], "not json", "x").reasons.get("SKU-T")!.source, "template");
});

import { isoWeekToMonday, readCase } from "../src/io/case";
test("Case data: ISO weeks map to Mondays", () => {
  assert.equal(isoWeekToMonday("2026-W27"), "2026-06-29");
  assert.equal(isoWeekToMonday("2026-W42"), "2026-10-12");
  assert.equal(isoWeekToMonday("2026-W01"), "2025-12-29");
});
test("Case data: 22 Oct 2026 run flags 5 reorders and 2 pauses with the festival uplift on", () => {
  const c = readCase("data/case");
  const res = runPlanner(c.master, c.sales, c.stock, [], "2026-10-22", { ...S, festivalMonths: c.festivalMonthsByYear[2026] });
  assert.equal(res.festival, true);
  assert.deepEqual(c.festivalMonthsByYear[2026], [3, 10, 11]);
  assert.equal(res.counts.reorder_now, 5);
  assert.equal(res.counts.pause, 2);
  const mango = res.recommendations.find((r) => r.sku === "SKU001")!;
  assert.deepEqual(mango.rules, ["R1_high_demand", "R2_stockout_risk"]);
  assert.equal(mango.recommendedQty, 750);
  const coconut = res.recommendations.find((r) => r.sku === "SKU007")!;
  assert.equal(coconut.status, "pause", "perishable at 4.1 weeks is above its 4-week max");
});
