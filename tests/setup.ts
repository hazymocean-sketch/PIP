import { beforeAll } from "vitest";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/pip_test";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-0123456789";
process.env.SEARCH_PROVIDER = ""; process.env.AI_PROVIDER = "";

beforeAll(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  await db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  const { seedBase } = await import("@/server/seed");
  await seedBase();
});
