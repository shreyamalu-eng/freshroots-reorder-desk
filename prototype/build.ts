// Builds prototype/review-queue.html: the real engine, bundled for the browser, plus the
// aggregated SYNTHETIC sample run embedded as JSON. Usage: npm run prototype
import { buildSync } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { aggregate } from "../src/engine/engine";
import { DEFAULT_SETTINGS } from "../src/engine/types";
import { readOpenPOs, readSales, readSkuMaster, readStock } from "../src/io/csv";

const RUN_DATE = "2026-10-22";
const dir = "data/sample";
const { inputs, issues } = aggregate(
  readSkuMaster(`${dir}/sku_master.csv`),
  readSales(`${dir}/sap_sales_weekly.csv`),
  readStock(`${dir}/sap_stock.csv`),
  readOpenPOs(`${dir}/zoho_open_pos.csv`),
  RUN_DATE,
  DEFAULT_SETTINGS,
);

const data = {
  runDate: RUN_DATE,
  weeks: inputs[0].weeks,
  issues,
  skus: inputs.map((i) => ({
    m: i.master, w: i.weekly, oh: i.onHand, oo: i.onOrder, hw: i.historyWeeks, sw: i.swings,
  })),
};

const engine = buildSync({
  entryPoints: ["src/engine/browser.ts"], bundle: true, format: "iife", globalName: "Planner",
  write: false, minify: true, target: "es2020",
}).outputFiles[0].text;

const tpl = readFileSync("prototype/template.html", "utf8");
const html = tpl
  .replace("/*%%ENGINE%%*/", () => engine)
  .replace("/*%%DATA%%*/null", () => JSON.stringify(data));
writeFileSync("prototype/review-queue.html", html);
console.log(`prototype/review-queue.html written (${Math.round(html.length / 1024)} KB, ${data.skus.length} SKUs).`);
