// Probe (not a pass/fail gate): what happens to keystrokes typed in the
// sub-render window immediately after Enter-split, at inhuman speed (delay 5ms,
// no pause after Enter)? Historically compared the CRDT path against the
// (since-deleted) legacy pipeline; now probes the unconditional CRDT path.
//
// Usage: bun e2e/split-typing-window-probe.mjs --base <url> [--pause <ms-after-enter>]
import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const base = arg("base");
const pause = Number(arg("pause", "0"));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));

await page.goto(`${base}/pages`);
await page.waitForTimeout(4000);
await page.getByText("Blank page", { exact: true }).first().click();
await page.waitForTimeout(3000);

const block = page.locator('[data-block-id] [contenteditable="true"]').first();
await block.waitFor({ state: "visible", timeout: 10000 });
await block.click();

const LINES = ["alpha one", "bravo two", "charlie three", "delta four"];
await page.keyboard.type(LINES[0], { delay: 5 });
for (const line of LINES.slice(1)) {
  await page.keyboard.press("Enter");
  if (pause > 0) await page.waitForTimeout(pause);
  await page.keyboard.type(line, { delay: 5 });
}
await page.waitForTimeout(3000);

const texts = await page.evaluate(() =>
  [...document.querySelectorAll('[data-block-id] [contenteditable="true"]')].map(
    (el) => el.innerText,
  ),
);
console.log("pause:", pause, "observed:", JSON.stringify(texts));
console.log("expected:", JSON.stringify(LINES));
await browser.close();
