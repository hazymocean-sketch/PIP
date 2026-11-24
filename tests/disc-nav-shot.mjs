import { chromium } from "playwright-core";
const base = "http://localhost:3100"; const run = process.argv[2];
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "pip_theme", value: "dark", url: base }]);
const p = await ctx.newPage(); const errs = []; let fails = 0;
p.on("dialog", (d) => d.accept());
p.on("response", (r) => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url()}`); });
p.on("pageerror", (e) => errs.push("JS " + e.message));
const ok = (name, cond) => { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) fails++; };
const pos = async () => (await p.locator(".pager .pos").textContent()).trim();
await p.goto(base + "/login"); await p.fill("#email", "admin@pip.local"); await p.fill("#password", "LocalTest-Pass123");
await Promise.all([p.waitForURL(base + "/"), p.click("button[type=submit]")]);

await p.goto(`${base}/discoveries`);
await p.selectOption("select[aria-label='Filter by search']", run); await p.waitForURL(/run=/);
ok("run filter shows 5 results", (await p.locator(".li-check").count()) === 5);
await p.screenshot({ path: "test-artifacts/discover-run-filter.png" });

await p.locator(".li-check a").first().click(); await p.waitForURL(/\/discoveries\/[0-9a-f-]{36}\?run=/);
ok("detail shows 1 / 5", (await pos()) === "1 / 5");
await p.screenshot({ path: "test-artifacts/discovery-pager.png" });
await p.click("a[aria-label='Next discovery']"); await p.waitForFunction(() => document.querySelector(".pager .pos")?.textContent?.trim() === "2 / 5");
ok("Next button → 2 / 5", (await pos()) === "2 / 5");
await p.keyboard.press("ArrowRight"); await p.waitForFunction(() => document.querySelector(".pager .pos")?.textContent?.trim() === "3 / 5");
ok("→ key → 3 / 5", (await pos()) === "3 / 5");
await p.keyboard.press("ArrowLeft"); await p.waitForFunction(() => document.querySelector(".pager .pos")?.textContent?.trim() === "2 / 5");
ok("← key → 2 / 5", (await pos()) === "2 / 5");

const before = p.url();
await p.click("button:has-text('Delete & next')"); await p.waitForURL((u) => u.href !== before && /ok=/.test(u.href));
ok("Delete & next moves on (now 2 / 4)", (await pos()) === "2 / 4");
await p.fill("input[name=reason]", "Not relevant"); await p.click("button:has-text('Reject & next')"); await p.waitForURL(/Discovery%20rejected|Discovery\+rejected/);
ok("Reject & next moves on", /\/discoveries\/[0-9a-f-]{36}/.test(p.url()));

await p.goto(`${base}/discoveries?run=${run}`);
const rows = await p.locator(".li-check").count();
await p.locator(".li-check input[type=checkbox]").first().check();
ok("bulk bar counts selection", /1 selected/.test(await p.locator(".bulk-bar").textContent()));
await p.click("button:has-text('Delete selected')"); await p.waitForURL(/ok=/); await p.waitForFunction((n) => document.querySelectorAll('.li-check').length === n, rows - 1, { timeout: 10000 }).catch(() => {});
ok("Delete selected removes 1", (await p.locator(".li-check").count()) === rows - 1);
await p.goto(`${base}/discoveries?status=all&run=${run}`);
await p.click("button:has-text(\"Delete this search's results\")"); await p.waitForURL(/ok=/);
ok("Delete this search's results empties the run", /Deleted \d+ discover/.test(decodeURIComponent(p.url()).replace(/\+/g, " ")));
await p.setViewportSize({ width: 390, height: 844 }); await p.goto(`${base}/discoveries`); await p.screenshot({ path: "test-artifacts/discover-mobile.png" });
ok("no server/JS errors", errs.length === 0); if (errs.length) console.log(errs);
await b.close(); process.exit(fails ? 1 : 0);
