/**
 * Browser + context lifecycle for e2e scripts.
 *
 * `chromium.launch()` and `{ viewport: { width: 1400, height: 900 } }` appeared
 * verbatim in 23 of the 29 pre-move scripts, and the two-context convergence
 * tests repeated the whole context+page+error-listener block once for A and once
 * for B. None of them closed the browser in a `finally`, so any mid-script throw
 * leaked a Chromium process — `withBrowser` fixes that for every caller at once.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { flag } from "./args";
import { capture, type Captured } from "./capture";
import { detectOsColorScheme, type ColorScheme } from "./color-scheme";

export const DEFAULT_VIEWPORT = { width: 1400, height: 900 } as const;

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
 * Launch chromium, run `fn`, and always close the browser. `--headed` on the
 * command line opens a visible window, which is the one thing every script
 * author reaches for when a flow misbehaves.
 */
export async function withBrowser<T>(fn: (h: Harness) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: !flag("headed") });
  try {
    return await fn({
      browser,
      async session(opts: SessionOptions = {}): Promise<Session> {
        const context = await browser.newContext({
          viewport: opts.viewport ?? { ...DEFAULT_VIEWPORT },
          colorScheme: opts.colorScheme ?? detectOsColorScheme(),
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
    await page.locator(opts.marker).first().waitFor({ state: "visible", timeout: timeoutMs });
  } else {
    await page.waitForLoadState("networkidle", { timeout: timeoutMs });
  }
  if (opts.settleMs) await page.waitForTimeout(opts.settleMs);
}
