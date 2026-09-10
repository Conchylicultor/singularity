// Leaf by contract: string literals and the WHATWG URL API only. No `node:*`,
// no DOM globals — the browser boot path and a test runner both import this.

/**
 * The declared query flag. A document opened with `?embed=1` renders ONE route
 * with no app chrome (no app rail, no tab bar, no floating action bar), because
 * something else — a comparison surface, a frame in another app — supplies the
 * frame around it.
 */
export const EMBED_PARAM = "embed";
export const EMBED_VALUE = "1";

/** Does this `location.search`-shaped string (leading `?` or not) declare the flag? */
export function hasEmbedFlag(search: string): boolean {
  return new URLSearchParams(search).get(EMBED_PARAM) === EMBED_VALUE;
}

/**
 * `rawUrl` with the flag set, as an origin-relative URL (`pathname + search +
 * hash`). Goes through `URL`, so a path that already carries a query gains
 * `&embed=1` rather than a second `?`, and a flag it already carries is
 * overwritten rather than duplicated. `origin` only anchors the parse — it is
 * not part of the result.
 */
export function withEmbedFlag(rawUrl: string, origin: string): string {
  const url = new URL(rawUrl, origin);
  url.searchParams.set(EMBED_PARAM, EMBED_VALUE);
  return url.pathname + url.search + url.hash;
}
