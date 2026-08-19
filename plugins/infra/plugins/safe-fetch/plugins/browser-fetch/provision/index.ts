/**
 * Install-time provisioning: the chromium binary this plugin launches at
 * runtime.
 *
 * Why this exists: the Playwright npm *package* is provisioned by `bun install`,
 * but the chromium *binary* is only fetched by an explicit `playwright install` —
 * two separate mechanisms that drift. Each Playwright minor pins a different
 * chromium revision, so the moment the resolved version's revision isn't already
 * cached, `chromium.launch()` hard-errors. Provisioning the binary by the same
 * mechanism that provisions the package is what stops them drifting.
 *
 * WHY THIS LIVES IN `provision/` AND NOT IN `core/`. It used to be
 * `core/ensureChromium()`, and from there a *request path* reached it: the
 * prototype thumbnail render called it as its first statement, so a missing
 * binary meant a backend downloading ~150 MB synchronously — the event loop
 * blocked for the whole download, answering no health check, no live-state and
 * no job, invisible even to the queue-health watchdog (a `setInterval` on the
 * loop it blocks). Downloading and installing is provisioning; provisioning is
 * install-time work. Here, no runtime can call it: `provision` is a declared
 * runtime in `boundary-config.ts` and no other runtime may import it.
 *
 * A runtime that finds no binary therefore FAILS, loudly, naming this command —
 * see `errors.ts:browserUnavailable`. That is honest: `./singularity` runs
 * `bun install` on every invocation, so a backend that is serving has already
 * been through provisioning, and a binary missing at that point is an operator
 * problem, not something a page load should quietly fix.
 *
 * The e2e harness contributes its own provisioning step that calls
 * `provisionChromium` — one implementation, two contributions, because a
 * backend's correctness must not depend on a tooling plugin's install step.
 * The check is idempotent, so the second one is a single `existsSync`.
 */
import { existsSync } from "node:fs";
import { spawnPassthrough } from "@plugins/infra/plugins/spawn/core";

/**
 * Ceiling on the download. It is not decoration: `./singularity` runs
 * `bun install` on every invocation, so an install that never answers hangs a
 * *build*, with nobody at a terminal watching a stalled progress bar.
 */
const INSTALL_TIMEOUT_MS = 15 * 60_000;

/**
 * Ensure the chromium revision the currently-resolved Playwright expects is
 * present in the shared browser cache (~/Library/Caches/ms-playwright on macOS).
 *
 * Steady state is a noop: one path computation + one stat, then return. The
 * cache is global and shared across all worktrees, so only the first worktree on
 * a machine (per revision) ever downloads.
 */
export async function provisionChromium(): Promise<void> {
  const { chromium } = await import("playwright");

  // executablePath() is a pure getter: it computes where the binary should live
  // (respecting PLAYWRIGHT_BROWSERS_PATH and the OS default cache dir) without
  // launching anything or requiring the binary to exist. Safe to call when absent.
  const exe = chromium.executablePath();
  if (existsSync(exe)) return; // already provisioned — noop

  // Install-time: no backend is running, so the structured logger (which
  // persists over HTTP to a live server) is unreachable — console is the sink,
  // exactly as the rule's own `provision/**` exemption says.
  // eslint-disable-next-line log-channels/no-console-log -- install-time, no backend to log to
  console.log(`Playwright chromium not found at ${exe} — installing…`);

  // `spawnPassthrough` inherits stdout/stderr, so the download's own progress
  // output reaches the terminal — the whole reason this step is worth watching.
  // It carries no timeout of its own, so the bound is applied through the kill
  // handle it hands back synchronously.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const { exitCode, signalCode } = await spawnPassthrough(
      ["bunx", "playwright", "install", "chromium"],
      {
        onSpawn: ({ kill }) => {
          timer = setTimeout(() => {
            timedOut = true;
            kill("SIGTERM");
          }, INSTALL_TIMEOUT_MS);
        },
      },
    );
    if (timedOut) {
      throw new Error(
        `\`bunx playwright install chromium\` did not finish within ${INSTALL_TIMEOUT_MS}ms — killed`,
      );
    }
    if (exitCode !== 0) {
      throw new Error(
        `\`bunx playwright install chromium\` failed (exit ${exitCode}${signalCode ? `, signal ${signalCode}` : ""})`,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

export default async function provision(): Promise<void> {
  await provisionChromium();
}
