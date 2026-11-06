// Generates SYNTHETIC sample files shaped like the real SAP and Zoho exports.
// These are invented numbers for building and testing. They are not Freshroots data.
// Usage: npx tsx scripts/make-sample-data.ts [runDate=2026-10-22] [outDir=data/sample]
import { mkdirSync } from "node:fs";
import { lastCompleteWeek, parseISO, toISO, weekRange } from "../src/engine/engine";
import { writeCsv } from "../src/io/csv";

const runDate = process.argv[2] ?? "2026-10-22";
const outDir = process.argv[3] ?? "data/sample";
mkdirSync(outDir, { recursive: true });

// Seeded random so every run produces the same files.
let seed = 20261022;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);

const CATS: { cat: string; perish: number; names: string[]; sizes: string[]; price: [number, number] }[] = [
  { cat: "Namkeen", perish: 0, names: ["Bhujia", "Chivda", "Farsan", "Mixture", "Sev", "Moong dal", "Chakli", "Shev"], sizes: ["150g", "200g", "400g", "1kg"], price: [12, 180] },
  { cat: "Chips & snacks", perish: 0, names: ["Banana chips", "Potato wafers", "Masala puffs", "Corn rings", "Nachos"], sizes: ["50g", "90g", "150g"], price: [10, 60] },
  { cat: "Biscuits & rusk", perish: 0.1, names: ["Toast rusk", "Nankhatai", "Jeera biscuit", "Coconut cookie", "Khari"], sizes: ["200g", "300g", "500g"], price: [20, 120] },
  { cat: "Staples", perish: 0, names: ["Poha", "Besan", "Rava", "Toor dal", "Moong dal", "Chana dal", "Sabudana", "Kolam rice", "Jowar atta", "Bajra atta"], sizes: ["500g", "1kg", "5kg"], price: [45, 450] },
  { cat: "Spices & masala", perish: 0, names: ["Goda masala", "Kanda lasun masala", "Malvani masala", "Garam masala", "Turmeric", "Chilli powder"], sizes: ["50g", "100g", "200g"], price: [18, 140] },
  { cat: "Sweets & bakery", perish: 1, names: ["Chikki", "Modak pack", "Shrikhand", "Pav", "Fruit cake", "Karanji", "Laddoo"], sizes: ["100g", "250g", "500g"], price: [25, 260] },
];
const BRAND = "Freshroots";

type Scenario = "normal" | "surge" | "decline" | "launch" | "competitor" | "no_stock_row" | "negative_stock" | "dormant";
interface Sku { sku: string; name: string; category: string; perishable: boolean; price: number; launchWeeksAgo: number; scenario: Scenario; base: number; }

const N_SKU = 400;
const N_DIST = 1200;
const WEEKS = 20;
const last = lastCompleteWeek(runDate);
const weeks = weekRange(last, WEEKS);

const skus: Sku[] = [];
for (let i = 0; i < N_SKU; i++) {
  const c = pick(CATS);
  const scenario: Scenario =
    i < 8 ? "launch" : i < 12 ? "competitor" : i < 14 ? "no_stock_row" : i === 14 ? "negative_stock" : i < 18 ? "dormant"
    : rnd() < 0.09 ? "surge" : rnd() < 0.06 ? "decline" : "normal";
  skus.push({
    sku: `FR-${String(10001 + i)}`,
    name: `${BRAND} ${pick(c.names)} ${pick(c.sizes)}`,
    category: c.cat,
    perishable: rnd() < c.perish,
    price: Math.round(between(...c.price)),
    launchWeeksAgo: scenario === "launch" ? 3 + Math.floor(rnd() * 7) : 60 + Math.floor(rnd() * 100),
    scenario,
    base: Math.round(Math.exp(between(Math.log(40), Math.log(900)))),
  });
}

// SKU-level weekly multiplier: festival build-up in late Sept/Oct plus the scenario shape.
function mult(s: Sku, wi: number): number {
  const fromEnd = WEEKS - 1 - wi; // 0 = last complete week
  let m = 1 + 0.12 * Math.max(0, 5 - fromEnd) / 5; // gentle festival build over the last 5 weeks
  if (s.scenario === "surge" && fromEnd < 4) m *= 1.45;
  if (s.scenario === "decline" && fromEnd < 4) m *= 0.65;
  if (s.scenario === "dormant") m = 0;
  if (s.launchWeeksAgo <= fromEnd) m = 0; // not launched yet
  return m * between(0.88, 1.12);
}

// Each distributor stocks a handful of SKUs; split each SKU's base demand across its distributors.
const carriers = new Map<string, string[]>();
for (let d = 1; d <= N_DIST; d++) {
  const id = `D${String(d).padStart(4, "0")}`;
  const n = 6 + Math.floor(rnd() * 6);
  for (let k = 0; k < n; k++) {
    const s = skus[Math.floor(rnd() * N_SKU)].sku;
    if (!carriers.has(s)) carriers.set(s, []);
    if (!carriers.get(s)!.includes(id)) carriers.get(s)!.push(id);
  }
}
const sales: { week_start: string; distributor_id: string; sku: string; units: number }[] = [];
const weeklyTotal = new Map<string, number[]>();
for (const s of skus) {
  let ds = carriers.get(s.sku) ?? [`D${String(1 + Math.floor(rnd() * N_DIST)).padStart(4, "0")}`];
  if (s.scenario === "competitor") ds = [...ds.slice(0, 6), "D0007"]; // one large distributor carries ~35%
  const shares = ds.map((d) => (s.scenario === "competitor" && d === "D0007" ? 3.5 : between(0.5, 1.5)));
  const tot = shares.reduce((a, b) => a + b, 0);
  const totals = new Array(WEEKS).fill(0);
  weeks.forEach((w, wi) => {
    const m = mult(s, wi);
    ds.forEach((d, di) => {
      let u = (s.base * shares[di]) / tot * m;
      if (s.scenario === "competitor" && d === "D0007" && wi >= WEEKS - 4) u *= 0.4; // competitor scheme hits
      const units = Math.round(u * between(0.8, 1.2));
      if (units > 0) { sales.push({ week_start: w, distributor_id: d, sku: s.sku, units }); totals[wi] += units; }
    });
  });
  weeklyTotal.set(s.sku, totals);
}
// Three SKU codes SAP knows but the planner's SKU master does not.
for (const code of ["FR-99901", "FR-99902", "FR-99903"]) {
  weeks.slice(-6).forEach((w) => sales.push({ week_start: w, distributor_id: "D0101", sku: code, units: 12 }));
}

// Stock and open POs. Target cover is drawn so the queue has a realistic mix.
const stock: { sku: string; on_hand: number }[] = [];
const pos: { po_number: string; sku: string; qty: number; eta: string; status: string }[] = [];
const masterRows: Record<string, unknown>[] = [];
let po = 4410;
for (const s of skus) {
  const t = weeklyTotal.get(s.sku)!;
  const avg12 = t.slice(-12).reduce((a, b) => a + b, 0) / 12 || s.base * 0.3;
  const std = Math.max(50, Math.round((avg12 * (s.perishable ? 2 : 6)) / 50) * 50);
  const r = rnd();
  const cover = s.perishable
    ? (r < 0.2 ? between(1, 2.8) : r < 0.35 ? between(4.5, 7) : between(3, 4))
    : (r < 0.12 ? between(1.5, 5.5) : r < 0.22 ? between(15, 26) : between(6.5, 13.5));
  let onHand = Math.round(avg12 * cover);
  if (s.scenario === "dormant") onHand = Math.round(s.base * between(2, 6));
  if (s.scenario === "negative_stock") onHand = -Math.round(between(20, 90));
  if (s.scenario !== "no_stock_row") stock.push({ sku: s.sku, on_hand: onHand });
  if (rnd() < 0.22 && s.scenario !== "dormant") {
    pos.push({ po_number: `PO-26-${po++}`, sku: s.sku, qty: std, eta: "", status: "Issued" });
  }
  const launch = weekRange(last, s.launchWeeksAgo)[0];
  masterRows.push({
    sku: s.sku, name: s.name, category: s.category, perishable: s.perishable, standard_qty: std,
    unit_price: s.price, launch_date: launch, active: true,
  });
}
// ETA one to three weeks after the run.
for (const p of pos) p.eta = toISO(parseISO(runDate) + Math.round(between(5, 21)) * 86_400_000);

writeCsv(`${outDir}/sku_master.csv`, masterRows);
writeCsv(`${outDir}/sap_sales_weekly.csv`, sales);
writeCsv(`${outDir}/sap_stock.csv`, stock);
writeCsv(`${outDir}/zoho_open_pos.csv`, pos);

const counts = skus.reduce<Record<string, number>>((a, s) => ((a[s.scenario] = (a[s.scenario] ?? 0) + 1), a), {});
console.log(`SYNTHETIC sample written to ${outDir}: ${skus.length} SKUs, ${sales.length} sales rows over ${WEEKS} weeks, ${stock.length} stock rows, ${pos.length} open POs.`);
console.log("Scenarios:", counts);
