/** The public shape of a browser-backed page read. */

/**
 * Everything that prevented reading the page AT ALL. `status` is deliberately
 * NOT in this list: a 404 still renders HTML, and the caller decides what a 404
 * means — exactly as `safeFetch` callers own their own status assertion.
 *
 * `browser-unavailable` is separated from the rest because it is an OPERATOR
 * problem (no chromium binary), not a statement about the URL. A caller that
 * classifies errors must keep it in its transient bucket; parking a source with
 * a red "this page cannot be read" over a missing binary would be a lie.
 */
export type BrowserFetchFailureKind =
  | "browser-unavailable"
  | "navigation-failed"
  | "navigation-timeout"
  | "selector-timeout"
  | "too-many-redirects"
  | "html-too-large"
  | "network-budget-exceeded"
  | "aborted";

export interface BrowserFetchTimings {
  /** Summed `chromium.launch()` time across every pinned hop. */
  launchMs: number;
  /** Summed `page.goto` time across every pinned hop. */
  navigateMs: number;
  /** Time spent letting the final page settle (network idle / selector). */
  settleMs: number;
  /** Wall time from pool admission to the serialized DOM. */
  totalMs: number;
}

export interface BrowserFetchResult {
  /** Final URL after redirects — what relative links resolve against. */
  url: string;
  /** Final MAIN-DOCUMENT status. A non-2xx is a success value, not a throw. */
  status: number;
  /**
   * Final main-document response headers, lowercased. Present so the caller can
   * re-run `detectBotMitigation` on the *rendered* answer — "a real browser was
   * refused too" is a different fact from "our plain fetch was refused".
   */
  headers: Record<string, string>;
  /**
   * The serialized DOM after render. **NEVER truncated**: a short page with a
   * 200 status is indistinguishable downstream from a site that legitimately has
   * nothing on it, which is the one input that can silently delete a consumer's
   * records. Over the cap we throw `html-too-large` instead.
   */
  html: string;
  /** Redirect hops followed, in-browser and cross-host relaunches together. */
  redirects: number;
  timings: BrowserFetchTimings;
}

export interface BrowserFetchInit {
  /**
   * Whole-operation budget. The clock starts AFTER pool admission, so a call
   * that queued behind two other renders is not charged for the queue.
   */
  timeoutMs?: number;
  /** Bound on one `chromium.launch()`. Breach ⇒ `browser-unavailable`. */
  launchTimeoutMs?: number;
  /** Bound on one `page.goto`. Breach ⇒ `navigation-timeout`. */
  navigationTimeoutMs?: number;
  /**
   * How long to let the page settle after DOMContentLoaded (network idle, and
   * `waitForSelector` when given). Reaching this ceiling on network idle is the
   * EXPECTED path, not a failure — a live page never goes idle.
   */
  settleMs?: number;
  /** Wait for this selector before serializing. Breach ⇒ `selector-timeout`. */
  waitForSelector?: string;
  /** Cross-host + in-browser redirect hops. Low: each cross-host hop relaunches. */
  maxRedirects?: number;
  /** Serialized-DOM ceiling. Breach ⇒ `html-too-large` (never a truncated page). */
  maxHtmlBytes?: number;
  /** Best-effort network ceiling. Breach ⇒ `network-budget-exceeded`. */
  maxNetworkBytes?: number;
  /** Viewport. Tall by default so lazy/virtualized lists render more rows. */
  viewport?: { width: number; height: number };
  /** Honored in addition to `timeoutMs`, checked at every step boundary. */
  signal?: AbortSignal;
}

/** `BrowserFetchInit` with every default filled in. */
export interface ResolvedInit {
  timeoutMs: number;
  launchTimeoutMs: number;
  navigationTimeoutMs: number;
  settleMs: number;
  waitForSelector: string | undefined;
  maxRedirects: number;
  maxHtmlBytes: number;
  maxNetworkBytes: number;
  viewport: { width: number; height: number };
  signal: AbortSignal | undefined;
}

export const BROWSER_FETCH_DEFAULTS = {
  timeoutMs: 45_000,
  launchTimeoutMs: 30_000,
  navigationTimeoutMs: 20_000,
  settleMs: 3_000,
  maxRedirects: 3,
  maxHtmlBytes: 8 * 1024 * 1024,
  maxNetworkBytes: 24 * 1024 * 1024,
  viewport: { width: 1280, height: 2400 },
} as const;

export function resolveInit(init: BrowserFetchInit): ResolvedInit {
  return {
    timeoutMs: init.timeoutMs ?? BROWSER_FETCH_DEFAULTS.timeoutMs,
    launchTimeoutMs:
      init.launchTimeoutMs ?? BROWSER_FETCH_DEFAULTS.launchTimeoutMs,
    navigationTimeoutMs:
      init.navigationTimeoutMs ?? BROWSER_FETCH_DEFAULTS.navigationTimeoutMs,
    settleMs: init.settleMs ?? BROWSER_FETCH_DEFAULTS.settleMs,
    waitForSelector: init.waitForSelector,
    maxRedirects: init.maxRedirects ?? BROWSER_FETCH_DEFAULTS.maxRedirects,
    maxHtmlBytes: init.maxHtmlBytes ?? BROWSER_FETCH_DEFAULTS.maxHtmlBytes,
    maxNetworkBytes:
      init.maxNetworkBytes ?? BROWSER_FETCH_DEFAULTS.maxNetworkBytes,
    viewport: init.viewport ?? BROWSER_FETCH_DEFAULTS.viewport,
    signal: init.signal,
  };
}
