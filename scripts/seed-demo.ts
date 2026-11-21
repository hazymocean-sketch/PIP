import "dotenv/config";
import { pool } from "../src/db";
import { seedDemo } from "../src/server/demo";
seedDemo().then(async () => { console.log("✓ demo data loaded (all records flagged DEMO)"); await pool.end(); }).catch((e) => { console.error(e); process.exit(1); });
