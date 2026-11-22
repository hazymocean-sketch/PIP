import { chromium } from "playwright-core";
const base = "http://localhost:3100"; const pid = process.argv[2];
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "pip_theme", value: "dark", url: base }]);
const p = await ctx.newPage();
await p.goto(base + "/login"); await p.fill("#email", "admin@pip.local"); await p.fill("#password", "LocalTest-Pass123");
await Promise.all([p.waitForURL(base + "/"), p.click("button[type=submit]")]);
await p.goto(`${base}/projects/${pid}#decision-makers`); await p.waitForTimeout(1500);
const el = p.locator("#decision-makers"); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
await el.screenshot({ path: "test-artifacts/decision-makers.png" });
// error path: real API with invalid key must show a clear message, not crash
await p.click("button:has-text('Find decision-makers')"); await p.waitForURL(/error=|ok=/, { timeout: 30000 });
console.log("flash:", (await p.locator(".flash").first().textContent())?.trim());
await b.close();
