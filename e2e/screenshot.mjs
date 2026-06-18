// Reusable Playwright capture for UI verification.
//
// Use this when you need to *interact* with the app (click a button, inspect
// state, capture before/after). For a single static snapshot, the simpler
// `bunx playwright screenshot ...` CLI is fine.
//
// Usage:
//   bun e2e/screenshot.mjs --url <url> [--click <aria-label>] [--out <path>] [--color-scheme dark|light]
//
// By default the screenshot inherits the host OS appearance (macOS dark/light)
// so a `colorMode: "system"` app renders exactly as the user sees it. Pass
// `--color-scheme dark|light` to force one.
//
// Example (my docs button):
//   bun e2e/screenshot.mjs \
//     --url http://claude-1776361358.localhost:9000/agents/c/claude-1776360729 \
//     --click "Design docs" \
//     --out /tmp/docs
//
// Produces `<out>-before.png` and (if --click) `<out>-after.png`, and logs
// the matched button's state (disabled, aria-pressed, text). Copy and adapt
// for richer flows (multi-click, assertions, etc.).

import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

// Headless Chromium hardcodes `prefers-color-scheme: light`, so a `colorMode:
// "system"` app always renders light in screenshots even when the user's OS is
// dark. To mirror what the user actually sees, detect the real OS appearance and
// emulate it. On macOS `defaults read -g AppleInterfaceStyle` prints "Dark" when
// dark and exits non-zero (no key) when light. `--color-scheme` overrides.
function detectOsColorScheme() {
  if (process.platform === "darwin") {
    try {
      const out = execFileSync("defaults", ["read", "-g", "AppleInterfaceStyle"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return out.trim() === "Dark" ? "dark" : "light";
    } catch {
      return "light"; // key absent → Light appearance
    }
  }
  return "light";
}

const url = arg("url");
const click = arg("click");
const out = arg("out", "/tmp/screenshot");
const viewport = arg("viewport", "1400x900").split("x").map(Number);
const waitMs = Number(arg("wait", "3000"));
const colorScheme = arg("color-scheme", detectOsColorScheme());

if (!url) {
  console.error("Usage: bun e2e/screenshot.mjs --url <url> [--click <aria-label>] [--out <path>] [--color-scheme dark|light]");
  process.exit(2);
}

console.log(`color-scheme: ${colorScheme}`);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: viewport[0], height: viewport[1] },
  colorScheme,
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
