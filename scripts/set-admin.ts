/**
 * Create or reset the administrator account.
 *   npm run admin:set -- you@example.com
 * The password is read from a hidden prompt (or ADMIN_PASSWORD env var for CI).
 * It is never stored in plain text or printed.
 */
import "dotenv/config";
import readline from "node:readline";
import { pool } from "../src/db";
import { authCore } from "../src/server/auth-core";

function hidden(q: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let asked = false;
    out._writeToOutput = (s: string) => { if (!asked) { out.output.write(s); asked = true; } };
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}

async function main() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  if (!email) throw new Error("Usage: npm run admin:set -- you@example.com");
  let pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    pw = await hidden("New admin password (min 12 chars, upper+lower+number): ");
    const again = await hidden("Repeat password: ");
    if (pw !== again) throw new Error("Passwords do not match");
  }
  await authCore.upsertAdmin(email, pw);
  console.log(`✓ Administrator ${email} is set. Existing sessions were signed out.`);
  await pool.end();
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
