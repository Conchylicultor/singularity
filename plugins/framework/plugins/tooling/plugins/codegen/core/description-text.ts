/**
 * Text shaping for plugin descriptions in the generated docs. The compact index
 * is loaded into every agent session, so a description there is an index entry,
 * not documentation: one plugin's line must stay a line.
 */

/** Longest description the compact listings (index, sub-plugin lists) print. */
export const COMPACT_DESCRIPTION_MAX = 200;

/** Sentence boundary: a full stop followed by whitespace and a capital. */
const SENTENCE_BREAK = /(?<=\.)\s+(?=[A-Z])/;

/**
 * Joins a plugin's per-runtime descriptions, dropping any sentence an earlier
 * part already said — a plugin whose web and server barrels share a sentence
 * (often the whole description) says it once.
 */
export function joinDescriptions(parts: readonly string[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    for (const sentence of part.trim().split(SENTENCE_BREAK)) {
      const s = sentence.trim();
      if (s === "" || seen.has(s)) continue;
      seen.add(s);
      kept.push(s);
    }
  }
  return kept.join(" ");
}

/**
 * Caps a description at `max` characters, cutting at a word boundary and
 * ending with `…` so a truncated entry never reads as complete.
 */
export function capDescription(
  desc: string,
  max: number = COMPACT_DESCRIPTION_MAX,
): string {
  if (desc.length <= max) return desc;
  const head = desc.slice(0, max - 1);
  const lastSpace = head.lastIndexOf(" ");
  const cut = lastSpace > max / 2 ? head.slice(0, lastSpace) : head;
  return `${cut.replace(/[\s,;:—–-]+$/, "")}…`;
}
