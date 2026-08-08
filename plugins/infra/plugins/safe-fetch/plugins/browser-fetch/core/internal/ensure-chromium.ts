/**
 * Ensure the chromium revision the currently-resolved Playwright expects is
 * present in the shared browser cache (~/Library/Caches/ms-playwright on macOS).
 *
 * Why this exists: the Playwright npm *package* is provisioned by `bun install`,
 * but the chromium *binary* is only fetched by an explicit `playwright install` —
 * two separate mechanisms that drift. Each Playwright minor pins a different
 * chromium revision, so the moment the resolved version's revision isn't already
 * cached, `chromium.launch()` hard-errors. Running as a provisioning
 * contribution provisions the binary by the same mechanism that provisions the
 * package, so they can never drift.
 *
 * It lives HERE, in the primitive that needs chromium at *runtime*, rather than
 * in the e2e tooling plugin that first needed it: a backend whose refresh path
 * launches a browser must not have its correctness depend on a tooling plugin's
 * install step. The e2e harness now calls this same function, so there is one
 * implementation with two contributions — and the runner is idempotent, so the
 * second one is a single `existsSync` in steady state.
 *
 * `core/` here means RUNTIME-NEUTRAL NODE, not web-safe: this reaches
 * `node:fs` / `node:child_process` and must never be imported from `web/`.
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * Steady state is a noop: one path computation + one stat, then return. The
 * cache is global and shared across all worktrees, so only the first worktree on
 * a machine (per revision) ever downloads.
 *
 * Playwright is loaded lazily. Importing it costs ~3 s of module evaluation on
 * this box — a price a backend must never pay at boot just because something in
 * its graph *can* start a browser. Every caller of this function is already
 * doing seconds of work (an install step, a browser launch), so the lazy import
 * is free where it is paid.
 */
export async function ensureChromium(): Promise<void> {
  const { chromium } = await import("playwright");

  // executablePath() is a pure getter: it computes where the binary should live
  // (respecting PLAYWRIGHT_BROWSERS_PATH and the OS default cache dir) without
  // launching anything or requiring the binary to exist. Safe to call when absent.
  const exe = chromium.executablePath();
  if (existsSync(exe)) return; // already provisioned — noop

  // Install-time provisioning: no backend is running, so the structured logger
  // (which persists over HTTP to a live server) is unreachable — console is the
  // sink, exactly as the rule's own `provision/**` exemption says. This body
  // lives in `core/` rather than in a `provision/` folder only so the two
  // provision contributions share ONE implementation.
  // eslint-disable-next-line log-channels/no-console-log -- install-time, no backend to log to
  console.log(`Playwright chromium not found at ${exe} — installing…`);
  execFileSync("bunx", ["playwright", "install", "chromium"], {
    stdio: "inherit",
  });
}
