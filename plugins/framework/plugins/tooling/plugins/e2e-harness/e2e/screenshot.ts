// Reusable Playwright capture for UI verification.
//
// Use this when you need to *interact* with the app (click a button, inspect
// state, capture before/after). For a single static snapshot, the simpler
// `bunx playwright screenshot ...` CLI is fine.
//
// Usage:
//   bun plugins/framework/plugins/tooling/plugins/e2e-harness/e2e/screenshot.ts \
//     [--url <url>] [--click <aria-label>] [--out <path>] [--color-scheme dark|light]
//
// --url defaults to this worktree's own deploy, so the bare command screenshots
// the app you just built. By default the screenshot inherits the host OS
// appearance (macOS dark/light) so a `colorMode: "system"` app renders exactly as
// the user sees it. Pass `--color-scheme dark|light` to force one.
//
// Example:
//   bun plugins/framework/plugins/tooling/plugins/e2e-harness/e2e/screenshot.ts \
//     --url http://<worktree>.localhost:9000/agents/c/<id> \
//     --click "Design docs" \
//     --out /tmp/docs
//
// Produces `<out>-before.png` and (if --click) `<out>-after.png`, and logs
// the matched button's state (disabled, aria-pressed, text). Copy and adapt
// for richer flows (multi-click, assertions, etc.).

import type { Locator } from "playwright";
import { arg, numArg } from "./args";
import { baseUrl } from "./target";
import { withBrowser } from "./browser";
import { detectOsColorScheme, type ColorScheme } from "./color-scheme";
import { snap } from "./shots";

const url = baseUrl();
const click = arg("click");
const out = arg("out", "/tmp/screenshot");
const waitMs = numArg("wait", 3000);
const viewportRaw = arg("viewport", "1400x900").split("x").map(Number);
const viewport = {
  width: viewportRaw[0] ?? 1400,
  height: viewportRaw[1] ?? 900,
};
const colorScheme = (arg("color-scheme") ?? detectOsColorScheme()) as ColorScheme;

console.log(`url:          ${url}`);
console.log(`color-scheme: ${colorScheme}`);

await withBrowser(async (h) => {
  const { page } = await h.session({ viewport, colorScheme });

  await page.goto(url);
  await page.waitForTimeout(waitMs);
  await snap(page, out, "before");

  if (!click) return;

  // A "clickable" is anything button-shaped: plain buttons, but also
  // SegmentedControl options (role=radio), tabs, and toggle chips — a <button>
  // with an overriding role is invisible to getByRole("button").
  const roles = ["button", "radio", "tab", "menuitem", "switch"] as const;
  // Poll instead of sampling once: on a cold boot the app can take longer than
  // the fixed --wait to first paint, and a single count() check reads as
  // "no such button" when the truth is "not booted yet".
  const deadline = Date.now() + 20_000;
  let btn: Locator | null = null;
  while (!btn && Date.now() < deadline) {
    for (const role of roles) {
      // exact: getByRole's default name match is substring, which happily
      // "matches" any long text that merely contains the label.
      const candidate = page.getByRole(role, { name: click, exact: true });
      if ((await candidate.count()) > 0) {
        btn = candidate;
        break;
      }
    }
    if (!btn) await page.waitForTimeout(500);
  }
  if (!btn) {
    console.error(`no clickable (${roles.join("/")}) matched "${click}"`);
    process.exitCode = 1;
    return;
  }

  const first = btn.first();
  console.log("clickable:", {
    role: await first.evaluate(
      (el) => el.getAttribute("role") ?? el.tagName.toLowerCase(),
    ),
    disabled: await first.isDisabled(),
    pressed: await first.getAttribute("aria-pressed"),
    checked: await first.getAttribute("aria-checked"),
    text: (await first.innerText()).slice(0, 80),
  });
  await first.click();
  await page.waitForTimeout(1500);
  await snap(page, out, "after");
});
