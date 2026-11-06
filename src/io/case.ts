// Adapter for the MESA case files (calendar, current_inventory, distributor_master, sku_master, weekly_sales).
// Maps them onto the engine's types. Gaps in the case data are filled with stated assumptions:
//   - no prices      -> unitPrice 1, so "at risk" is measured in units, not rupees
//   - no launch date -> the first week with sales
//   - no open POs    -> 0 on order (Zoho not connected yet)
//   - one distributor per SKU -> distributor-swing check cannot run (needs several distributors per SKU)
import { readFileSync } from "node:fs";
import { parseISO, toISO } from "../engine/engine";
import type { SalesRow, SkuMaster, StockRow } from "../engine/types";
import { parseCsv } from "./csv";

/** Monday of ISO week "2026-W27". */
export function isoWeekToMonday(isoWeek: string): string {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(isoWeek.trim());
  if (!m) throw new Error(`Not an ISO week: "${isoWeek}"`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = parseISO(`${year}-01-04`);
  const dow = (new Date(jan4).getUTCDay() + 6) % 7; // Monday = 0
  const week1Monday = jan4 - dow * 86_400_000;
  return toISO(week1Monday + (week - 1) * 7 * 86_400_000);
}

export interface Distributor { id: string; name: string; region: string; status: string }

export interface CaseData {
  master: SkuMaster[];
  sales: SalesRow[];
  stock: StockRow[];
  stockAsOf: string;
  location: string;
  festivalMonthsByYear: Record<number, number[]>;
  distributors: Distributor[];
  skuDistributor: Record<string, string>;
  uom: Record<string, string>;
}

export function readCase(dir: string): CaseData {
  const read = (f: string) => parseCsv(readFileSync(`${dir}/${f}`, "utf8"));
  const skus = read("sku_master.csv");
  const salesRaw = read("weekly_sales.csv");
  const inv = read("current_inventory.csv");
  const cal = read("calendar.csv");
  const dist = read("distributor_master.csv");

  const sales: SalesRow[] = salesRaw.map((r) => ({
    weekStart: isoWeekToMonday(r.Week),
    distributorId: "ALL", // case sales are already totalled per SKU
    sku: r.SKU_ID,
    units: Number(r.Units_Sold),
  }));
  const firstWeek = new Map<string, string>();
  for (const s of sales) {
    if (s.units > 0 && (!firstWeek.has(s.sku) || s.weekStart < firstWeek.get(s.sku)!)) firstWeek.set(s.sku, s.weekStart);
  }
  const master: SkuMaster[] = skus.map((r) => ({
    sku: r.SKU_ID,
    name: r.SKU_Name,
    category: r.Category,
    perishable: /^high$/i.test(r.Perishability),
    standardQty: Number(r.Standard_Reorder_Qty),
    unitPrice: 1,
    launchDate: firstWeek.get(r.SKU_ID) ?? "2000-01-03",
    active: true,
  }));
  const festivalMonthsByYear: Record<number, number[]> = {};
  for (const c of cal) {
    if (/^true$/i.test(c.Is_Festival_Month)) (festivalMonthsByYear[Number(c.Year)] ??= []).push(Number(c.Month));
  }
  return {
    master,
    sales,
    stock: inv.map((r) => ({ sku: r.SKU_ID, onHand: Number(r.Units_On_Hand) })),
    stockAsOf: inv[0]?.As_Of_Date ?? "",
    location: inv[0]?.Location ?? "",
    festivalMonthsByYear,
    distributors: dist.map((d) => ({ id: d.Distributor_ID, name: d.Distributor_Name, region: d.Region, status: d.Status })),
    skuDistributor: Object.fromEntries(skus.map((r) => [r.SKU_ID, r.Distributor_ID])),
    uom: Object.fromEntries(skus.map((r) => [r.SKU_ID, r.Unit_of_Measure])),
  };
}
