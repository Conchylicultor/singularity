import type { StoredPicks } from "@plugins/apps/plugins/prototypes/plugins/files/core";

/** The `version` segment that means the live folder rather than a recorded sha. */
export const LIVE_VERSION = "live";

/**
 * A frame's own picks as ONE route segment: `a=b,c=d`. Each name and value is
 * escaped on its own first, so a `,` or `=` inside one can never split it.
 * (The route then escapes the whole segment once more; the router undoes that.)
 */
export function encodePicks(picks: StoredPicks): string {
  return Object.entries(picks)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join(",");
}

/** The inverse of {@link encodePicks}. Throws on a part that is not `name=value`. */
export function decodePicks(segment: string): StoredPicks {
  const picks: Record<string, string> = {};
  for (const part of segment.split(",")) {
    if (part === "") continue;
    const at = part.indexOf("=");
    if (at <= 0) throw new Error(`Malformed pick "${part}" in "${segment}"`);
    picks[decodeURIComponent(part.slice(0, at))] = decodeURIComponent(
      part.slice(at + 1),
    );
  }
  return picks;
}
