// Load the MESA case files (data/case) into Neon: distributors, SKU master, sales, stock, festival calendar, rule settings.
// Idempotent (upserts). Usage: npm run db:import
import { Client } from "pg";
import { DEFAULT_SETTINGS } from "../src/engine/types";
import { readCase } from "../src/io/case";
import { parseCsv } from "../src/io/csv";
import { readFileSync } from "node:fs";
import { loadEnv } from "./env";

loadEnv();
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("No DATABASE_URL set.");
const dir = process.argv[2] ?? "data/case";
const c = readCase(dir);
const cal = parseCsv(readFileSync(`${dir}/calendar.csv`, "utf8"));
const db = new Client({ connectionString: url });
await db.connect();
await db.query("begin");
for (const d of c.distributors) {
  await db.query("insert into distributors (id,name,region,status) values ($1,$2,$3,$4) on conflict (id) do update set name=excluded.name, region=excluded.region, status=excluded.status", [d.id, d.name, d.region, d.status]);
}
for (const m of c.master) {
  await db.query(
    `insert into sku_master (sku,name,category,perishable,standard_qty,unit_price,launch_date,active,distributor_id,uom)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (sku) do update set name=excluded.name, category=excluded.category, perishable=excluded.perishable,
       standard_qty=excluded.standard_qty, launch_date=excluded.launch_date, distributor_id=excluded.distributor_id, uom=excluded.uom, updated_at=now()`,
    [m.sku, m.name, m.category, m.perishable, m.standardQty, m.unitPrice, m.launchDate, m.active, c.skuDistributor[m.sku] ?? null, c.uom[m.sku] ?? "Units"],
  );
}
for (const s of c.sales) {
  await db.query("insert into sales_weekly (week_start,sku,distributor_id,units) values ($1,$2,$3,$4) on conflict (week_start,sku,distributor_id) do update set units=excluded.units", [s.weekStart, s.sku, s.distributorId, s.units]);
}
for (const s of c.stock) {
  await db.query("insert into stock_snapshots (as_of,sku,location,on_hand) values ($1,$2,$3,$4) on conflict (as_of,sku,location) do update set on_hand=excluded.on_hand", [c.stockAsOf, s.sku, c.location, s.onHand]);
}
for (const r of cal) {
  await db.query("insert into festival_calendar (year,month,is_festival) values ($1,$2,$3) on conflict (year,month) do update set is_festival=excluded.is_festival", [Number(r.Year), Number(r.Month), /^true$/i.test(r.Is_Festival_Month)]);
}
await db.query("insert into rule_settings (id, settings) values (1, $1) on conflict (id) do nothing", [DEFAULT_SETTINGS]);
await db.query("commit");
const counts = await db.query(`select (select count(*) from distributors) d, (select count(*) from sku_master) s, (select count(*) from sales_weekly) w, (select count(*) from stock_snapshots) k, (select count(*) from festival_calendar) f`);
console.log("Imported case data:", counts.rows[0]);
await db.end();
