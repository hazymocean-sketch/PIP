import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pipPool?: Pool };

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const isLocal = /localhost|127\.0\.0\.1|host=\//.test(url);
  return new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
}

export const pool = globalForDb.pipPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalForDb.pipPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
