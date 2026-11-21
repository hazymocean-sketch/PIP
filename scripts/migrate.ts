import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../src/db";
import { seedBase } from "../src/server/seed";

async function main() {
  if (!process.env.DATABASE_URL) { console.log("DATABASE_URL not set — skipping migrations"); return; }
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ migrations applied");
  await seedBase(); // idempotent: only inserts missing configuration
  console.log("✓ base configuration ensured");
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
