import { hasEmbedFlag, withEmbedFlag } from "../../core";

let resolved: boolean | undefined;

/**
 * Is THIS document a chromeless embed?
 *
 * Read ONCE, on first call, and memoized for the document's lifetime — never
 * re-read from the URL later. The pane store rebuilds every URL it writes from
 * the route alone (`buildRouteUrl` + `applyBasePath` in `primitives/pane`), so
 * no query survives the first in-frame click; a live read would drop the flag
 * and bring the chrome back mid-session. The flag is a fact about how this
 * document was OPENED, and that is what is captured.
 */
export function isEmbeddedDocument(): boolean {
  resolved ??=
    typeof window === "undefined"
      ? false
      : hasEmbedFlag(window.location.search);
  return resolved;
}

/** An in-app URL (`/agents/c/1`, query allowed) that opens chromeless. */
export function embedUrl(path: string): string {
  return withEmbedFlag(path, window.location.origin);
}

/** Drop the memoized read between tests (mirrors resetAppInstanceForTests). */
export function resetEmbedForTests(): void {
  resolved = undefined;
}
