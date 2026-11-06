// Neon Postgres connection for the app.
// Per Neon's guidance for Vercel: node-postgres (pg) with Fluid compute, and attachDatabasePool
// so idle clients are released before a function instance is suspended.
// DATABASE_URL should be the POOLED Neon string (host contains "-pooler").
import { attachDatabasePool } from "@vercel/functions";
import { Pool, types, type PoolClient } from "pg";

// Return Postgres DATE as "YYYY-MM-DD" text. The default (a JS Date at local midnight) shifts days across time zones.
types.setTypeParser(1082, (v: string) => v);

declare global {
  // eslint-disable-next-line no-var
  var __frPool: Pool | undefined;
}

function makePool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Run `neon env pull` (or `neon deploy`) to write it to .env.local.");
  const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 5_000, connectionTimeoutMillis: 10_000 });
  attachDatabasePool(pool);
  return pool;
}

export function pool(): Pool {
  if (!globalThis.__frPool) globalThis.__frPool = makePool();
  return globalThis.__frPool;
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query(text, params);
  return res.rows as T[];
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
