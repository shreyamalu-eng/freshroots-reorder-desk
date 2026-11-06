// Minimal CSV read/write for the SAP and Zoho exports. Handles quoted fields with commas.
import { readFileSync, writeFileSync } from "node:fs";
import type { OpenPO, SalesRow, SkuMaster, StockRow } from "../engine/types";

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

const num = (s: string, field: string): number => {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Not a number in column "${field}": "${s}"`);
  return n;
};

export function readSkuMaster(path: string): SkuMaster[] {
  return parseCsv(readFileSync(path, "utf8")).map((r) => ({
    sku: r.sku,
    name: r.name,
    category: r.category,
    perishable: r.perishable === "true" || r.perishable === "1" || r.perishable === "Y",
    standardQty: num(r.standard_qty, "standard_qty"),
    unitPrice: num(r.unit_price, "unit_price"),
    launchDate: r.launch_date,
    active: r.active !== "false" && r.active !== "0" && r.active !== "N",
  }));
}
export function readSales(path: string): SalesRow[] {
  return parseCsv(readFileSync(path, "utf8")).map((r) => ({
    weekStart: r.week_start, distributorId: r.distributor_id, sku: r.sku, units: num(r.units, "units"),
  }));
}
export function readStock(path: string): StockRow[] {
  return parseCsv(readFileSync(path, "utf8")).map((r) => ({ sku: r.sku, onHand: num(r.on_hand, "on_hand") }));
}
export function readOpenPOs(path: string): OpenPO[] {
  return parseCsv(readFileSync(path, "utf8")).map((r) => ({
    sku: r.sku, poNumber: r.po_number, qty: num(r.qty, "qty"), eta: r.eta,
  }));
}
export function writeCsv(path: string, rows: Record<string, unknown>[]) {
  writeFileSync(path, toCsv(rows));
}
