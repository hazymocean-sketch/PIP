import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pipPool?: Pool };

/**
 * Builds the connection string. If DATABASE_PASSWORD is set, it is URL-encoded and
 * inserted into DATABASE_URL (replacing "[YOUR-PASSWORD]" or any existing password),
 * so the Supabase link can be pasted exactly as copied and symbols in the password are safe.
 */
export function resolveDatabaseUrl(rawUrl = process.env.DATABASE_URL, password = process.env.DATABASE_PASSWORD): string {
  if (!rawUrl) throw new Error("DATABASE_URL is not set");
  let url = rawUrl.trim().replace(/^["']|["']$/g, "");
  const pw = password?.trim();
  if (pw) {
    const enc = encodeURIComponent(pw);
    if (/\[YOUR-[A-Z-]*PASSWORD\]/i.test(url)) url = url.replace(/\[YOUR-[A-Z-]*PASSWORD\]/i, enc);
    else url = url.replace(/^(postgres(?:ql)?:\/\/[^:@/]+):[^@]*@/, `$1:${enc}@`).replace(/^(postgres(?:ql)?:\/\/[^:@/]+)@/, `$1:${enc}@`);
  }
  if (/\[YOUR-[A-Z-]*PASSWORD\]/i.test(url)) throw new Error("DATABASE_URL still contains [YOUR-PASSWORD] — set DATABASE_PASSWORD or replace it");
  try { new URL(url); } catch { throw new Error(`DATABASE_URL is not a valid link (${describeUrl(rawUrl)}). Paste the Supabase Session pooler link exactly and put the password in DATABASE_PASSWORD.`); }
  return url;
}

/** Safe, secret-free description of a connection string's shape, for build logs. */
export function describeUrl(raw: string) {
  const v = raw.trim();
  const scheme = (v.match(/^([a-z]+):\/\//i)?.[1] ?? "none");
  const host = v.split("@").pop()?.split("/")[0]?.replace(/:[0-9]+$/, "") ?? "";
  const user = v.match(/^[a-z]+:\/\/([^:@/]+)/i)?.[1] ?? "";
  return [
    `length ${v.length}`, `scheme "${scheme}"`, `@ signs ${(v.match(/@/g) ?? []).length}`,
    `host "${/supabase|localhost|amazonaws/.test(host) ? host : host ? "(other)" : "(none)"}"`,
    `user "${user.startsWith("postgres") ? user : user ? "(other)" : "(none)"}"`,
    `has spaces ${/\s/.test(v)}`, `has brackets ${/[\[\]]/.test(v)}`, `starts with "${v.slice(0, 6).replace(/[^a-z:/ ]/gi, "?")}"`,
  ].join(", ");
}

/**
 * At runtime on Vercel, use Supabase's *transaction* pooler (port 6543) instead of the session pooler (5432).
 * Session mode caps the whole project at 15 clients, which several serverless instances exhaust quickly
 * ("EMAXCONNSESSION max clients reached"). Build-time scripts (migrations) keep session mode.
 * Override with DB_POOL_MODE=session.
 */
export function runtimeUrl(url: string, env: Record<string, string | undefined> = process.env) {
  if (env.DB_POOL_MODE === "session" || env.npm_lifecycle_event) return url;
  return url.replace(/(\.pooler\.supabase\.com):5432(?=[/?]|$)/, "$1:6543");
}

function makePool() {
  const url = runtimeUrl(resolveDatabaseUrl());
  const isLocal = /localhost|127\.0\.0\.1|host=\//.test(url);
  const p = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? (isLocal ? 5 : 3)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  p.on("error", () => { /* idle client dropped by the pooler — the pool replaces it */ });
  return p;
}

export const pool = globalForDb.pipPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalForDb.pipPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
