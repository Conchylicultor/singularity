// Reusable Playwright capture for UI verification.
//
// Use this when you need to *interact* with the app (click a button, inspect
// state, capture before/after). For a single static snapshot, the simpler
// `bunx playwright screenshot ...` CLI is fine.
//
// Usage:
//   bun e2e/screenshot.mjs --url <url> [--click <aria-label>] [--out <path>]
//
// Example (my docs button):
//   bun e2e/screenshot.mjs \
//     --url http://claude-1776361358.localhost:9000/c/claude-1776360729 \
//     --click "Design docs" \
//     --out /tmp/docs
//
// Produces `<out>-before.png` and (if --click) `<out>-after.png`, and logs
// the matched button's state (disabled, aria-pressed, text). Copy and adapt
// for richer flows (multi-click, assertions, etc.).

import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const url = arg("url");
const click = arg("click");
const out = arg("out", "/tmp/screenshot");
const viewport = arg("viewport", "1400x900").split("x").map(Number);
const waitMs = Number(arg("wait", "3000"));

if (!url) {
  console.error("Usage: bun e2e/screenshot.mjs --url <url> [--click <aria-label>] [--out <path>]");
  process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: viewport[0], height: viewport[1] },
});
const page = await context.newPage();

await page.goto(url);
await page.waitForTimeout(waitMs);
await page.screenshot({ path: `${out}-before.png` });
console.log(`wrote ${out}-before.png`);

if (click) {
  const btn = page.getByRole("button", { name: click });
  const count = await btn.count();
  if (count === 0) {
    console.error(`no button matched "${click}"`);
    await browser.close();
    process.exit(1);
  }
  const first = btn.first();
  console.log("button:", {
    disabled: await first.isDisabled(),
    pressed: await first.getAttribute("aria-pressed"),
    text: (await first.innerText()).slice(0, 80),
  });
  await first.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}-after.png` });
  console.log(`wrote ${out}-after.png`);
}

await browser.close();
