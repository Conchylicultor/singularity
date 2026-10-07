// ── Comparing song names across sites ────────────────────────────────────────
//
// A song is spelled differently by every site that names it: "The Beatles" /
// "Beatles", "Beyoncé" / "Beyonce", "Don't" / "Dont", "Wonderwall (Remastered)",
// "Señorita (feat. Camila Cabello)". `normalizeSongKey` folds those spellings to
// one comparable key; `keyTokens` splits it for a token-set match.

const PARENTHETICAL = /\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g;
const FEATURING = /(?:^|\s)(?:feat\.?|ft\.|featuring)(?:\s.*)?$/;

/** Lower case, without accents, apostrophes or curly quotes: the base every key starts from. */
export function foldText(text: string): string {
  return (
    text
      .normalize("NFKD")
      // Combining marks: what "é" leaves behind once decomposed.
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      // "Don't" and "Dont" are the same word.
      .replace(/['’‘`´]/g, "")
  );
}

function keyOf(folded: string): string {
  return folded
    .replace(FEATURING, " ")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the\s+/, "");
}

/**
 * The comparable key of an artist or a song title: lower case, no accents or
 * apostrophes, no parenthetical (`(Remastered 2009)`, `[Official Video]`), no
 * "feat. …" tail, `&` read as "and", punctuation as spaces, and no leading
 * "The". "The Beatles" and "Beatles" have one key; so do "Beyoncé" and
 * "beyonce".
 *
 * A name that is ALL parenthetical ("(Untitled)") keeps its words: dropping
 * them would leave nothing to compare.
 */
export function normalizeSongKey(name: string): string {
  const folded = foldText(name);
  const key = keyOf(folded.replace(PARENTHETICAL, " "));
  return key !== "" ? key : keyOf(folded.replace(/[()[\]{}]/g, " "));
}

/** The words of a key, for a token-set comparison. */
export function keyTokens(key: string): string[] {
  return key === "" ? [] : key.split(" ");
}
