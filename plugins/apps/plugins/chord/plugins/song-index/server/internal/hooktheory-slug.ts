// ── Hooktheory's URL slugs, from a display name ──────────────────────────────
//
// The dump's `artist_slug` / `song_slug` are Hooktheory's own URL segments, and
// they follow one convention (read off main's index, 2026-10-07): lower case,
// punctuation dropped (`Don't` → `dont`), a space becomes `-` (so " - " is
// `---`), and parentheses are kept percent-encoded (`(Live)` → `%28live%29`).
// A leading "The" is sometimes kept (`the-beatles`) and sometimes not
// (`beatles`), and `&` is spelled "and" or dropped — so a name gives a few
// slugs, and the lookup asks for all of them through the slug index.

function fold(name: string): string {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

function slugOf(folded: string): string {
  return folded
    .replace(/[^a-z0-9 ()-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

/**
 * The slugs Hooktheory may file a name under: the name as written, with `&`
 * as "and" and without it, without its parentheticals, and with and without a
 * leading "the". Never empty for a name with a letter or digit in it.
 */
export function hooktheorySlugs(name: string): string[] {
  const folded = fold(name);
  const spellings = new Set<string>();
  for (const amp of [folded.replace(/&/g, " and "), folded]) {
    for (const parens of [amp, amp.replace(/\([^)]*\)|\[[^\]]*\]/g, " ")]) {
      const bare = slugOf(parens.replace(/^\s*the\s+/, ""));
      if (!/[a-z0-9]/.test(bare)) continue;
      spellings.add(bare);
      spellings.add(`the-${bare}`);
    }
  }
  return [...spellings];
}
