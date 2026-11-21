import "dotenv/config";
import { pool } from "../src/db";
import { seedBase } from "../src/server/seed";
seedBase().then(async () => { console.log("✓ base configuration seeded (ventures, sectors, scoring, agents, workflow templates)"); await pool.end(); })
  .catch((e) => { console.error(e); process.exit(1); });
