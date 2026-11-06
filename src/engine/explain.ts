// Steps 11-12: the LLM writes the one-line reason, the code checks it.
// The model never sees or changes a quantity it could invent: every number it may use is listed,
// and any other number in its text causes the template reason to be used instead.

import type { Recommendation } from "./types";

export const EXPLAIN_SYSTEM_PROMPT = `You write one-line explanations for a demand planner's review queue at Freshroots, an FMCG distributor in Maharashtra and Goa.
The reader is Raghav, the senior demand planner. He knows the rules. He wants the reason in plain words, fast.

Rules for every line:
- One sentence, at most 30 words. Lead with what is happening to stock or demand, end with the action.
- Use ONLY numbers that appear in that item's "allowed_numbers" list. Never compute, round differently or invent a number.
- Never change the action or the quantity. The action is already decided.
- Do not mention AI, models or confidence. No exclamation marks.
- Write units as "units" and weeks as "weeks".

Also write a "summary" of at most 3 sentences for the top of the run email: how many SKUs need action, the biggest risk, and anything unusual. Use only numbers from "run_numbers".

Return JSON only, in this shape:
{"items":[{"sku":"...","reason":"..."}],"summary":"..."}`;

export interface ExplainItem {
  sku: string;
  name: string;
  action: string;
  rules: string[];
  facts: Record<string, number | string | boolean | null>;
  allowed_numbers: number[];
}

/** Numbers the model may quote for one recommendation. */
export function allowedNumbers(r: Recommendation): number[] {
  const pct = r.avg12 > 0 ? Math.round((r.avg4 / r.avg12 - 1) * 100) : 0;
  const nums = [
    r.avg4, r.avg12, r.demand, r.onHand ?? 0, r.onOrder, (r.onHand ?? 0) + r.onOrder,
    r.coverWeeks ?? 0, r.window.min, r.window.max, r.standardQty,
    r.recommendedQty ?? 0, r.suggestedQty ?? 0, pct, Math.abs(pct), 4, 12, 1.5, 25,
  ];
  return [...new Set(nums.filter((n) => Number.isFinite(n)))];
}

const ACTION: Record<string, (r: Recommendation) => string> = {
  reorder_now: (r) => `Reorder ${r.recommendedQty} units now`,
  reorder: (r) => `Reorder ${r.recommendedQty} units`,
  pause: () => "Pause the next order",
  exception: () => "Raghav decides",
  held: () => "Held back for data fix",
  ok: () => "No action",
};

export function buildExplainItems(recs: Recommendation[]): ExplainItem[] {
  return recs
    .filter((r) => r.status !== "ok")
    .map((r) => ({
      sku: r.sku,
      name: r.name,
      action: ACTION[r.status](r),
      rules: [...r.rules, ...r.exceptionReasons, ...r.heldReasons],
      facts: {
        perishable: r.perishable,
        festival_uplift_applied: r.festival,
        avg_last_4_weeks: r.avg4,
        avg_last_12_weeks: r.avg12,
        weekly_demand_used: r.demand,
        on_hand: r.onHand,
        on_order: r.onOrder,
        weeks_of_cover: r.coverWeeks,
        window_min_weeks: r.window.min,
        window_max_weeks: r.window.max,
      },
      allowed_numbers: allowedNumbers(r),
    }));
}

export function buildExplainUserMessage(recs: Recommendation[], runNumbers: Record<string, number>): string {
  return JSON.stringify({ run_numbers: runNumbers, items: buildExplainItems(recs) });
}

/** Pull every number out of a sentence ("1,250" -> 1250, "6.5" -> 6.5, "25%" -> 25). */
export function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((s) => Number(s.replace(/,/g, "")));
}

export interface Validation {
  ok: boolean;
  bad: number[];
}

/** Step 12: every number in the model's text must be one the item allowed. */
export function validateReason(text: string, allowed: number[]): Validation {
  const bad = numbersIn(text).filter((n) => !allowed.some((a) => Math.abs(a - n) < 0.051));
  const tooLong = text.split(/\s+/).length > 40;
  return { ok: bad.length === 0 && !tooLong && text.trim().length > 0, bad };
}

export interface ExplainResult {
  reasons: Map<string, { text: string; source: "llm" | "template"; rejected?: string }>;
  summary: string;
}

/** Merge model output with the template reasons. Anything that fails validation falls back. */
export function mergeExplanations(
  recs: Recommendation[],
  modelJson: string | null,
  fallbackSummary: string,
  runNumbers: number[] = [],
): ExplainResult {
  const reasons: ExplainResult["reasons"] = new Map();
  let parsed: { items?: { sku: string; reason: string }[]; summary?: string } = {};
  if (modelJson) {
    try {
      const start = modelJson.indexOf("{");
      parsed = JSON.parse(modelJson.slice(start, modelJson.lastIndexOf("}") + 1));
    } catch {
      parsed = {};
    }
  }
  const byS = new Map((parsed.items ?? []).map((i) => [i.sku, i.reason]));
  for (const r of recs) {
    const t = byS.get(r.sku);
    if (t) {
      const v = validateReason(t, allowedNumbers(r));
      reasons.set(r.sku, v.ok ? { text: t, source: "llm" } : { text: r.reason, source: "template", rejected: t });
    } else {
      reasons.set(r.sku, { text: r.reason, source: "template" });
    }
  }
  const s = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const summaryOk = s.length > 0 && numbersIn(s).every((n) => runNumbers.some((a) => Math.abs(a - n) < 0.051));
  return { reasons, summary: summaryOk ? s : fallbackSummary };
}
