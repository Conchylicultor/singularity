/**
 * Install-time provisioning: ensure the chromium revision the currently-resolved
 * Playwright expects is present in the shared browser cache
 * (~/Library/Caches/ms-playwright on macOS).
 *
 * Why this exists: the Playwright npm *package* is provisioned by `bun install`,
 * but the chromium *binary* is only fetched by an explicit `playwright install` —
 * two separate mechanisms that drift. Each Playwright minor pins a different
 * chromium revision, so the moment the resolved version's revision isn't already
 * cached, `chromium.launch()` hard-errors and every e2e script breaks. Running as
 * a provisioning contribution provisions the binary by the same mechanism that
 * provisions the package, so they can never drift.
 *
 * Steady state is a noop: one path computation + one stat, then return. The cache
 * is global and shared across all worktrees, so only the first worktree on a
 * machine (per revision) ever downloads; every other invocation is a pure
 * existsSync hit.
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

export default async function provision(): Promise<void> {
  // executablePath() is a pure getter: it computes where the binary should live
  // (respecting PLAYWRIGHT_BROWSERS_PATH and the OS default cache dir) without
  // launching anything or requiring the binary to exist. Safe to call when absent.
  const exe = chromium.executablePath();
  if (existsSync(exe)) return; // already provisioned — noop

  console.log(`Playwright chromium not found at ${exe} — installing…`);
  execFileSync("bunx", ["playwright", "install", "chromium"], {
    stdio: "inherit",
  });
}
