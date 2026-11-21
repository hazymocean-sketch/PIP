import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../src/db";
import { seedBase } from "../src/server/seed";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function passwordShape() {
  const p = process.env.DATABASE_PASSWORD;
  if (p === undefined) return "DATABASE_PASSWORD is NOT set";
  return `DATABASE_PASSWORD length ${p.length} (after trimming ${p.trim().length}), ` +
    `letters ${(p.match(/[a-z]/gi) ?? []).length}, digits ${(p.match(/[0-9]/g) ?? []).length}, ` +
    `other characters ${(p.match(/[^a-z0-9]/gi) ?? []).length}, has spaces/newlines ${/\s/.test(p)}`;
}

async function main() {
  if (!process.env.DATABASE_URL) { console.log("DATABASE_URL not set — skipping migrations"); return; }
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query("select 1");
      console.log("✓ connected to database");
      break;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      console.error(`✗ database connection attempt ${attempt} failed: ${err.code ?? ""} ${err.message ?? e}`);
      if (err.code === "28P01") console.error(`  → password rejected by Supabase. ${passwordShape()}. Compare this length with the password you set in Supabase.`);
      if (attempt >= 4) throw e;
      await sleep(15000);
    }
  }
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ migrations applied");
  await seedBase(); // idempotent: only inserts missing configuration
  console.log("✓ base configuration ensured");
  await pool.end();
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
