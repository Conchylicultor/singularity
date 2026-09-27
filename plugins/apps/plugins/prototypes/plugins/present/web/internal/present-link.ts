import {
  parseViewport,
  viewportWord,
  type PrototypeViewport,
  type StoredPicks,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";

/** The `version` segment that means the live folder rather than a recorded sha. */
export const LIVE_VERSION = "live";

/** The `size` segment that means the size the prototype declares. */
export const DECLARED_SIZE = "declared";

/** A size as ONE route segment: its tag word, or `declared` for none given. */
export function encodeSize(size: PrototypeViewport | undefined): string {
  return size === undefined ? DECLARED_SIZE : viewportWord(size);
}

/** The inverse of {@link encodeSize}. Throws on a word that is not a size. */
export function decodeSize(segment: string): PrototypeViewport | undefined {
  if (segment === DECLARED_SIZE) return undefined;
  const parsed = parseViewport(segment);
  // parseViewport reads blank as the default size; a segment is never blank.
  if (!parsed.ok || segment.trim() === "") {
    throw new Error(`Malformed size "${segment}"`);
  }
  return parsed.viewport;
}

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
