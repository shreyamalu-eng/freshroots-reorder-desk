// Apply db/migrations/*.sql in order. Uses the DIRECT (unpooled) URL when present, as Neon recommends for migrations.
// Usage: npm run db:migrate
import { readdirSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { loadEnv } from "./env";

loadEnv();
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("No DATABASE_URL_UNPOOLED or DATABASE_URL set.");
const c = new Client({ connectionString: url });
await c.connect();
await c.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
const done = new Set((await c.query("select name from schema_migrations")).rows.map((r) => r.name));
for (const f of readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(f)) { console.log(`skip  ${f}`); continue; }
  await c.query("begin");
  try {
    await c.query(readFileSync(`db/migrations/${f}`, "utf8"));
    await c.query("insert into schema_migrations (name) values ($1)", [f]);
    await c.query("commit");
    console.log(`apply ${f}`);
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}
await c.end();
