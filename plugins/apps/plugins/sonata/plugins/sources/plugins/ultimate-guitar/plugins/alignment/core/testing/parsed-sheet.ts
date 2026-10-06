import type { ParsedTab } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";

/**
 * A `ParsedTab` from a terse spelling: one entry per section, each line a
 * space-separated chord row ("C G Am F") placed over an empty lyric, or a
 * `{ lyric }` for a lyric-only line. A section with no lines is an empty
 * header ("[Chorus]" written once, then only named).
 */
export function parsedSheet(
  sections: readonly {
    name: string;
    lines: readonly (string | { lyric: string })[];
  }[],
  meta: { capo?: number; key?: string | null } = {},
): ParsedTab {
  return {
    sections: sections.map((section) => ({
      name: section.name,
      lines: section.lines.map((line) => {
        if (typeof line !== "string") return { chords: [], lyric: line.lyric };
        const symbols = line.split(/\s+/).filter((s) => s.length > 0);
        return {
          chords: symbols.map((symbol, i) => ({ symbol, charOffset: i * 6 })),
          lyric: "",
        };
      }),
    })),
    key: meta.key ?? null,
    capo: meta.capo ?? 0,
  };
}
