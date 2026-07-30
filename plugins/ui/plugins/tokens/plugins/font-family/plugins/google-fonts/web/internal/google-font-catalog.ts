/**
 * The set of families Google Fonts can actually serve.
 *
 * This replaces a hand-maintained denylist of system font names. That filter
 * asked "is this a system font?" — unanswerable, because the set is open: every
 * OS keeps adding names, and the list was already full of near-misses (it had
 * `SF Mono` but not `SFMono-Regular`, `Segoe UI` but not `Segoe UI Emoji`,
 * `Helvetica` but not `Helvetica Neue`). Every miss became a request that
 * Google answered with `400 text/html`, which Chromium blocks as an opaque
 * response (`ERR_BLOCKED_BY_ORB`).
 *
 * Asking the inverse — "is this on Google Fonts?" — has exactly one
 * authoritative answer, and it is a closed set of ~1,900 names. See
 * `scripts/fetch-catalog.ts` for how the snapshot is refreshed.
 */

interface Catalog {
  generatedAt: string;
  families: string[];
}

/**
 * Memoize the *promise*, not the resolved value, so concurrent first callers
 * share one load instead of racing two parses. The catalog is ~38 KB of JSON
 * and this plugin contributes `Core.Root` — i.e. it is eager on every boot — so
 * the import is deferred to keep the blob out of the boot bundle entirely.
 * Fonts are inherently async (`display=swap`), so paying a chunk fetch here
 * costs nothing a user can see.
 */
let familiesPromise: Promise<ReadonlySet<string>> | undefined;

export function loadGoogleFontFamilies(): Promise<ReadonlySet<string>> {
  if (familiesPromise === undefined) {
    familiesPromise = import("./google-fonts-catalog.json").then(
      (mod) => new Set((mod.default as Catalog).families),
    );
  }
  return familiesPromise;
}
