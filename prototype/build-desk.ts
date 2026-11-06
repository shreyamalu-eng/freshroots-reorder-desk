// Builds prototype/reorder-desk.html from the MESA case files (data/case) and the real engine.
// Usage: npx tsx prototype/build-desk.ts
import { buildSync } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { aggregate } from "../src/engine/engine";
import { DEFAULT_SETTINGS } from "../src/engine/types";
import { readCase } from "../src/io/case";

const RUN_DATE = "2026-10-22";
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID ?? "";
const c = readCase("data/case");
const settings = { ...DEFAULT_SETTINGS, festivalMonths: c.festivalMonthsByYear[2026] ?? DEFAULT_SETTINGS.festivalMonths };
const { inputs, issues } = aggregate(c.master, c.sales, c.stock, [], RUN_DATE, settings);

const data = {
  runDate: RUN_DATE,
  runId: "r" + RUN_DATE.replace(/-/g, ""),
  weeks: inputs[0].weeks,
  settings,
  issues,
  stockAsOf: c.stockAsOf,
  location: c.location,
  distributors: c.distributors,
  skuDistributor: c.skuDistributor,
  uom: c.uom,
  driveFolderId: DRIVE_FOLDER_ID,
  skus: inputs.map((i) => ({ m: i.master, w: i.weekly, oh: i.onHand, oo: i.onOrder, hw: i.historyWeeks, sw: i.swings })),
};

const engine = buildSync({
  entryPoints: ["src/engine/browser.ts"], bundle: true, format: "iife", globalName: "Planner",
  write: false, minify: true, target: "es2020",
}).outputFiles[0].text;

const html = readFileSync("prototype/desk-template.html", "utf8")
  .replace("/*%%ENGINE%%*/", () => engine)
  .replace("/*%%DATA%%*/null", () => JSON.stringify(data));
writeFileSync("prototype/reorder-desk.html", html);
console.log(`prototype/reorder-desk.html written (${Math.round(html.length / 1024)} KB, ${data.skus.length} SKUs).`);
