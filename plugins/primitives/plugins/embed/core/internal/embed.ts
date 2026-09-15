// Leaf by contract: string literals and the WHATWG URL API only. No `node:*`,
// no DOM globals — the browser boot path and a test runner both import this.

/**
 * The declared query flag. A document opened with it is EMBEDDED: something
 * else — a comparison surface, a frame in another app — hosts it on this same
 * origin, so it leaves no trace in the host tab's storage. Its value says how
 * much of the app's own chrome it still draws.
 */
export const EMBED_PARAM = "embed";

/**
 * The two ways a document can be embedded, and the flag value that spells each.
 *
 * - `chromeless` (`?embed=1`): ONE route with no app chrome — no app rail, no
 *   tab bar, no floating action bar — because the host supplies the frame.
 * - `chrome` (`?embed=chrome`): the whole app, chrome included, as a person
 *   would see it in their own tab — for a host comparing the chrome itself.
 */
export const EMBED_VALUES = {
  chromeless: "1",
  chrome: "chrome",
} as const;

export type EmbedMode = keyof typeof EMBED_VALUES;

/**
 * The embed mode this `location.search`-shaped string (leading `?` or not)
 * declares, or `undefined` for a document that is not embedded. A value that
 * spells no mode (`?embed=0`, `?embed=true`) is not an embed.
 */
export function readEmbedMode(search: string): EmbedMode | undefined {
  const value = new URLSearchParams(search).get(EMBED_PARAM);
  for (const [mode, spelled] of Object.entries(EMBED_VALUES)) {
    if (value === spelled) return mode as EmbedMode;
  }
  return undefined;
}

/**
 * `rawUrl` with the flag set to `mode`, as an origin-relative URL (`pathname +
 * search + hash`). Goes through `URL`, so a path that already carries a query
 * gains `&embed=…` rather than a second `?`, and a flag it already carries is
 * overwritten rather than duplicated. `origin` only anchors the parse — it is
 * not part of the result.
 */
export function withEmbedFlag(
  rawUrl: string,
  origin: string,
  mode: EmbedMode,
): string {
  const url = new URL(rawUrl, origin);
  url.searchParams.set(EMBED_PARAM, EMBED_VALUES[mode]);
  return url.pathname + url.search + url.hash;
}
