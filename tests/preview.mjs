import { chromium } from "playwright-core";
const base = "http://localhost:3100";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
for (const theme of ["dark", "light"]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "pip_theme", value: theme, url: base }]);
  const p = await ctx.newPage();
  await p.goto(base + "/login"); await p.fill("#email", "admin@pip.local"); await p.fill("#password", "LocalTest-Pass123");
  await Promise.all([p.waitForURL(base + "/"), p.click("button[type=submit]")]);
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `test-artifacts/preview-dials-${theme}.png` });
  await ctx.close();
}
await b.close(); console.log("done");
