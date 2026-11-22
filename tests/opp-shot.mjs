import { chromium } from "playwright-core";
const base = "http://localhost:3100"; const [oid, unlinked] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "pip_theme", value: "dark", url: base }]);
const p = await ctx.newPage(); const errs = [];
p.on("response", (r) => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url()}`); });
await p.goto(base + "/login"); await p.fill("#email", "admin@pip.local"); await p.fill("#password", "LocalTest-Pass123");
await Promise.all([p.waitForURL(base + "/"), p.click("button[type=submit]")]);
await p.goto(`${base}/opportunities/${oid}`); await p.waitForTimeout(1200);
const el = p.locator("#decision-makers"); await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: "test-artifacts/opportunity-decision-makers.png" });
await p.click("#decision-makers button:has-text('Find decision-makers')"); await p.waitForURL(/error=|ok=/, { timeout: 30000 });
console.log("returned to:", new URL(p.url()).pathname, "| flash:", (await p.locator(".flash").first().textContent())?.trim());
await p.goto(`${base}/opportunities/${unlinked}`); console.log("unlinked notice:", await p.locator("#decision-makers .notice").isVisible());
for (const path of ["/discoveries", "/research"]) { await p.goto(base + path); console.log(path, "LinkedIn/Lusha shown:", (await p.content()).match(/linkedin\.com|Find decision-makers/i) ? "YES" : "no"); }
console.log("errors:", errs.length ? errs : "none"); await b.close();
