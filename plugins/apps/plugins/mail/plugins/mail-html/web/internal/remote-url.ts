/** True for an absolute `http(s)://…` URL (the remote-image gate condition). */
export function isRemoteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

// Matches a CSS `url( … )` token, capturing an optional quote and the inner URL.
// Global + case-insensitive so `replace`/`matchAll` walk every occurrence.
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

/** Every http(s) URL referenced by a `url(...)` token in a CSS text fragment. */
export function extractCssHttpUrls(cssText: string): string[] {
  const out: string[] = [];
  for (const m of cssText.matchAll(CSS_URL_RE)) {
    const url = (m[2] ?? "").trim();
    if (isRemoteHttpUrl(url)) out.push(url);
  }
  return out;
}

/**
 * Rewrite every http(s) `url(...)` token in a CSS text fragment. `map(url)`
 * returns the replacement URL (re-wrapped as `url("…")`), or `null` to drop the
 * reference entirely (replaced with the CSS keyword `none`, so e.g.
 * `background-image: url(x)` becomes `background-image: none` and nothing loads).
 * Non-http `url()`s (`data:`, relative) are left untouched.
 */
export function rewriteCssHttpUrls(
  cssText: string,
  map: (url: string) => string | null,
): string {
  return cssText.replace(CSS_URL_RE, (whole, _quote: string, url: string) => {
    const trimmed = url.trim();
    if (!isRemoteHttpUrl(trimmed)) return whole;
    const replacement = map(trimmed);
    return replacement === null ? "none" : `url("${replacement}")`;
  });
}
