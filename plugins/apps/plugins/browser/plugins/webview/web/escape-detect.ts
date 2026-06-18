/**
 * Detects a proxy *escape*: a proxied page self-navigated to an un-proxied
 * document via a mechanism the in-page shim cannot intercept — a JS `location`
 * assignment (`location.href = …` / `.assign` / `.replace`, all
 * `[LegacyUnforgeable]`) or a scripted `form.submit()` (which fires no submit
 * event). The destination re-blocks framing → blank frame.
 *
 * Signal, evaluated at the iframe's `onLoad`:
 * - A proxied HTML document ALWAYS posts a `commit` (the injected shim does so
 *   as it runs, before `onLoad`). An un-proxied destination never does — so
 *   `committed === false` means "this document was not served by our proxy".
 * - A parent-initiated load (omnibox/link/reload/back/forward) sets `loading`;
 *   an iframe-initiated load does not. `wasLoading === false` means the page
 *   navigated itself, not us.
 *
 * Combining both excludes the look-alikes:
 * - Successful proxied load → `committed` true (not an escape).
 * - PRG POST landing (iframe-initiated but routed through the proxy) →
 *   `committed` true (not an escape).
 * - Non-HTML / proxy error page (no shim, so no commit) → these are always
 *   parent-initiated, so `wasLoading` true (not an escape).
 * - Genuine escape → iframe-initiated (`!wasLoading`) AND un-proxied
 *   (`!committed`).
 *
 * Only judged for the active, proxied tab — the only frame whose `commit`s the
 * viewport tracks.
 */
export function isProxyEscape(opts: {
  /** The tab whose iframe fired `onLoad` is the active (visible) one. */
  active: boolean;
  /** Proxy mode is on for this surface. */
  proxyEnabled: boolean;
  /** The iframe `src` points at the proxy route. */
  proxiedSrc: boolean;
  /** The tab was `loading` (a parent-initiated load) when `onLoad` fired. */
  wasLoading: boolean;
  /** A `commit` arrived from this frame since its previous `onLoad`. */
  committed: boolean;
}): boolean {
  return (
    opts.active &&
    opts.proxyEnabled &&
    opts.proxiedSrc &&
    !opts.wasLoading &&
    !opts.committed
  );
}
