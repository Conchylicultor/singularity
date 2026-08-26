/**
 * Browser + context lifecycle for e2e scripts.
 *
 * `chromium.launch()` and `{ viewport: { width: 1400, height: 900 } }` appeared
 * verbatim in 23 of the 29 pre-move scripts, and the two-context convergence
 * tests repeated the whole context+page+error-listener block once for A and once
 * for B. None of them closed the browser in a `finally`, so any mid-script throw
 * leaked a Chromium process — `withBrowser` fixes that for every caller at once.
 */
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { flag } from "./args";
import { capture, type Captured } from "./capture";
import { detectOsColorScheme, type ColorScheme } from "./color-scheme";

export const DEFAULT_VIEWPORT = { width: 1400, height: 900 } as const;

/**
 * The running script, as a provenance label: `plugins/…/copy-paste-verify.ts`
 * → `"e2e:copy-paste-verify"`. Derived from argv rather than passed in — a
 * per-script argument is one more thing to remember, and the one that gets
 * forgotten is the one that leaks a page into the user's sidebar.
 */
function originSource(): string {
  const entry = process.argv[1];
  if (!entry) return "e2e";
  return `e2e:${basename(entry).replace(/\.[tj]sx?$/, "")}`;
}

export interface SessionOptions {
  viewport?: { width: number; height: number };
  /** Defaults to the host OS appearance so screenshots match what the user sees. */
  colorScheme?: ColorScheme;
  /** Prefix for captured-error lines, e.g. "A" / "B" in a convergence test. */
  label?: string;
  /** Set false to skip the pageerror/console/requestfailed listeners. */
  capture?: boolean;
}

export interface Session {
  context: BrowserContext;
  page: Page;
  captured: Captured;
  label: string;
}

export interface Harness {
  browser: Browser;
  /** A fresh context + page (own cookies, own storage, own websocket). */
  session(opts?: SessionOptions): Promise<Session>;
}

/**
 * One probe, reported inline. Every line of the diagnostic below is best-effort
 * by nature — we are already on an error path, and a probe that cannot answer
 * must not replace the launch failure with its own. So a failed probe returns
 * the reason it failed AS ITS VALUE: the line still appears, still says
 * something true, and the original error is still what gets thrown.
 */
function probe(what: () => string): string {
  try {
    return what();
  } catch (err) {
    return `<unavailable: ${err instanceof Error ? err.message : String(err)}>`;
  }
}

/**
 * Read a package's version through the SAME module graph the launch used —
 * `Bun.resolveSync` from `from`, not a hardcoded `node_modules` path.
 *
 * That distinction is the whole point of this function. Module resolution walks
 * UP the directory tree, and every worktree lives under the main checkout, so a
 * worktree with no `node_modules` of its own silently resolves the MAIN
 * checkout's playwright — a different version, pinning a different chromium
 * revision, with nothing on screen to say so.
 */
function packageVersion(
  spec: string,
  from: string,
): { path: string; version: string } {
  const pkgPath = Bun.resolveSync(`${spec}/package.json`, from);
  const { version } = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    version?: string;
  };
  return { path: pkgPath, version: version ?? "<no version field>" };
}

/**
 * Why a launch failure is re-thrown rather than left to Playwright.
 *
 * Playwright's own message names ONE fact — the executable path it wanted:
 *
 *   Executable doesn't exist at …/chromium_headless_shell-1234/…
 *
 * which reads like "run the installer" and is a dead end, because the installer
 * you would reach for provisions whatever version *your shell* resolves, not
 * the one this script just launched. The missing fact is WHICH playwright ran:
 * a revision the repo never chose means a module resolved from somewhere the
 * repo never chose, and the resolved-from path says where in one line.
 *
 * Deliberately NOT a pre-launch `existsSync` on `chromium.executablePath()`.
 * That getter returns the HEADED binary (`Google Chrome for Testing`), while a
 * headless launch runs `chrome-headless-shell` — a different file, of the same
 * revision, installed as its pair. A pre-stat would therefore be checking a
 * path no caller here launches. Playwright is the only authority on which
 * binaries a given launch needs, so we let it decide and annotate its verdict.
 */
function launchFailure(cause: unknown): Error {
  const here = import.meta.dir;
  const playwright = probe(() => {
    const { path, version } = packageVersion("playwright", here);
    return `${version}  (${path})`;
  });
  const core = probe(() => {
    // Resolved FROM the playwright package's own directory: playwright-core is
    // playwright's nested dependency, so it is not resolvable from the repo
    // root. It carries the browser revision pin, which is why it is named here
    // separately rather than assumed equal to playwright's own version.
    const pkg = Bun.resolveSync("playwright/package.json", here);
    const { path, version } = packageVersion("playwright-core", dirname(pkg));
    return `${version}  (${path})`;
  });
  const headed = probe(() => chromium.executablePath());
  const detail = cause instanceof Error ? cause.message : String(cause);

  return new Error(
    `Playwright could not launch chromium.\n` +
      `  playwright      ${playwright}\n` +
      `  playwright-core ${core}\n` +
      `  headed binary   ${headed}\n` +
      `                  (a headless launch runs chrome-headless-shell at the same\n` +
      `                   revision, its installed pair — the launch error below names\n` +
      `                   the exact file it wanted)\n` +
      `  launch error    ${detail}\n` +
      `\n` +
      `If the resolved path above is NOT inside this checkout, the script ran against\n` +
      `another checkout's dependencies. Run it as \`./singularity run <script.ts> [args…]\`,\n` +
      `which installs this worktree's own node_modules from its own lock first. If the\n` +
      `path IS correct, the browser is simply missing: \`bun run playwright install chromium\`.`,
    { cause },
  );
}

/**
 * Launch chromium, run `fn`, and always close the browser. `--headed` on the
 * command line opens a visible window, which is the one thing every script
 * author reaches for when a flow misbehaves.
 *
 * The single choke point for browser lifecycle across all 125 per-plugin
 * scripts, which is why the launch diagnostic lives here and nowhere else.
 */
export async function withBrowser<T>(
  fn: (h: Harness) => Promise<T>,
): Promise<T> {
  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: !flag("headed") });
  } catch (err) {
    throw launchFailure(err);
  }
  try {
    return await fn({
      browser,
      async session(opts: SessionOptions = {}): Promise<Session> {
        const context = await browser.newContext({
          viewport: opts.viewport ?? { ...DEFAULT_VIEWPORT },
          colorScheme: opts.colorScheme ?? detectOsColorScheme(),
          // Provenance, declared once for the whole harness. `extraHTTPHeaders`
          // applies to EVERY request the context issues — including the SPA's
          // own `fetch` calls — so this single line marks all existing scripts,
          // every future script, and ad-hoc `screenshot.ts --click` drives, with
          // nothing to opt into and nothing to remember. Server-side, the
          // agent-origin plugin turns the mark into a swept, segregated page.
          // See research/2026-07-29-global-agent-origin-provenance-for-pages.md.
          extraHTTPHeaders: {
            "x-singularity-origin": "agent",
            "x-singularity-origin-source": originSource(),
          },
        });
        const page = await context.newPage();
        const label = opts.label ?? "";
        return {
          context,
          page,
          label,
          captured:
            opts.capture === false
              ? { pageErrors: [], consoleErrors: [], failedRequests: [] }
              : capture(page, opts.label),
        };
      },
    });
  } finally {
    await browser.close();
  }
}

export interface BootOptions {
  /** A selector that proves the app actually rendered. */
  marker?: string;
  /** How long to wait for `marker` (or for load, when no marker). */
  timeoutMs?: number;
  /** A final fixed pause after the marker appears, for post-paint hydration. */
  settleMs?: number;
}

/**
 * Navigate and wait for the app to be genuinely ready.
 *
 * The pre-move scripts almost all used `goto` + `waitForTimeout(4000)`. A fixed
 * sleep is the single largest flake source here: on a cold backend the app can
 * take longer than the sleep (the script then reads an empty DOM and reports a
 * false failure), and on a warm one it wastes four seconds per navigation. Two
 * scripts had already independently reinvented a polling settle; this is that,
 * shared. `marker` keeps it app-agnostic — the harness never names a selector
 * belonging to any particular app.
 */
export async function boot(
  page: Page,
  url: string,
  opts: BootOptions = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  if (opts.marker) {
    await page
      .locator(opts.marker)
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
  } else {
    await page.waitForLoadState("networkidle", { timeout: timeoutMs });
  }
  if (opts.settleMs) await page.waitForTimeout(opts.settleMs);
}
