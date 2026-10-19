import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const g = globalThis as unknown as { __rodeDb?: DB };

export function isPglite() {
  return (process.env.DATABASE_URL ?? "").startsWith("pglite://");
}

function create(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (url.startsWith("pglite://")) {
    const dir = url.slice("pglite://".length);
    if (dir !== "memory") mkdirSync(dir, { recursive: true });
    const client = dir === "memory" ? new PGlite() : new PGlite(dir);
    return drizzlePglite(client, { schema }) as unknown as DB;
  }
  const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 5) });
  return drizzlePg(pool, { schema });
}

export function getDb(): DB {
  if (!g.__rodeDb) g.__rodeDb = create();
  return g.__rodeDb;
}

export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export { schema };
