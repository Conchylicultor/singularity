/**
 * Pure helpers + cross-runtime protocol for the in-app browser proxy. A leaf
 * (no imports) so both the webview consumer and the server handler can depend on
 * it downward without forming a cycle.
 */

/**
 * Route path of the framing-stripping browser proxy. MUST stay in sync with the
 * route in `../shared/endpoints.ts` (`GET /api/browser/proxy`).
 */
export const BROWSER_PROXY_PATH = "/api/browser/proxy";

/**
 * Wrap a target URL so the in-app browser loads it through the proxy (which
 * strips `X-Frame-Options` / CSP `frame-ancestors` so framing-blocked sites
 * render). Returns a same-origin relative URL.
 */
export function proxyUrl(target: string): string {
  return `${BROWSER_PROXY_PATH}?url=${encodeURIComponent(target)}`;
}

/**
 * True when `src` points at the proxy. Proxied content is served from our own
 * origin, so the webview must render it in an opaque sandbox (drop
 * `allow-same-origin`) — see the security model in the design doc. `proxyUrl`
 * always emits a relative path starting with `BROWSER_PROXY_PATH`, so a prefix
 * check is sufficient (no URL parsing).
 */
export function isProxyUrl(src: string): boolean {
  return src.startsWith(BROWSER_PROXY_PATH);
}

/**
 * postMessage protocol: the script the proxy injects into framed pages posts
 * this to its parent on an intercepted same-frame navigation (link click / GET
 * form submit). The webview listens and routes it through the normal
 * `navigate()` so the omnibox + history stay in sync and the page reloads
 * through the proxy exactly once.
 */
export const BROWSER_PROXY_NAV_MESSAGE = "singularity:browser-proxy-nav";

/**
 * The kind of in-page navigation the proxied page is reporting:
 * - `navigate` — parent-driven load (link click, GET form). Parent pushes a
 *   history entry and (re)loads the iframe.
 * - `newtab` — `window.open` / `target="_blank"`. Parent opens a new tab.
 * - `commit` — the iframe finished loading a full document at `url`
 *   (`document.baseURI` = the post-redirect final URL). Reconciles redirects +
 *   POST landings.
 * - `sync` — in-page SPA URL change (`pushState`/`replaceState`/`popstate`).
 *   Omnibox-display only; no reload, no history entry.
 */
export type BrowserProxyNavKind = "navigate" | "newtab" | "commit" | "sync";

const NAV_KINDS: readonly BrowserProxyNavKind[] = [
  "navigate",
  "newtab",
  "commit",
  "sync",
];

export interface BrowserProxyNavMessage {
  type: typeof BROWSER_PROXY_NAV_MESSAGE;
  /** Which navigation the proxied page is reporting. */
  kind: BrowserProxyNavKind;
  /** Absolute target URL (real origin) the proxied page wants to navigate to. */
  url: string;
}

/** Narrow an untrusted `message` event payload to a nav message, else null. */
export function parseBrowserProxyNavMessage(
  data: unknown,
): BrowserProxyNavMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.type !== BROWSER_PROXY_NAV_MESSAGE) return null;
  if (typeof m.url !== "string" || m.url === "") return null;
  // `kind` defaults to "navigate" for robustness (missing/invalid field).
  const kind =
    typeof m.kind === "string" && NAV_KINDS.includes(m.kind as BrowserProxyNavKind)
      ? (m.kind as BrowserProxyNavKind)
      : "navigate";
  return { type: BROWSER_PROXY_NAV_MESSAGE, kind, url: m.url };
}
