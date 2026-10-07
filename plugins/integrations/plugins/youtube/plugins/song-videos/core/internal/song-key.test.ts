import { describe, expect, test } from "bun:test";
import { foldText, keyTokens, normalizeSongKey } from "./song-key";

describe("normalizeSongKey", () => {
  test.each([
    // case and a leading "The"
    ["The Beatles", "beatles"],
    ["THE BEATLES", "beatles"],
    ["Beatles", "beatles"],
    // only a LEADING the
    ["Over the Rainbow", "over the rainbow"],
    ["Theory of a Deadman", "theory of a deadman"],
    // diacritics
    ["Beyoncé", "beyonce"],
    ["Sigur Rós", "sigur ros"],
    ["Señorita", "senorita"],
    // apostrophes are dropped, not split on
    ["Don't Stop Me Now", "dont stop me now"],
    ["Don’t Stop Me Now", "dont stop me now"],
    // parentheticals and brackets
    ["Wonderwall (Remastered)", "wonderwall"],
    ["Let It Be [Remastered 2009]", "let it be"],
    ["(They Long to Be) Close to You", "close to you"],
    // feat. tails, in and out of parentheses
    ["Señorita (feat. Camila Cabello)", "senorita"],
    ["Stay feat. Justin Bieber", "stay"],
    ["Lean On ft. MØ", "lean on"],
    ["Love Me Featuring Someone", "love me"],
    // & and punctuation
    ["Simon & Garfunkel", "simon and garfunkel"],
    ["AC/DC", "ac dc"],
    ["Oasis - Wonderwall", "oasis wonderwall"],
    ["  spaced   out  ", "spaced out"],
  ])("%p → %p", (name, key) => {
    expect(normalizeSongKey(name)).toBe(key);
  });

  test("a name that is all parenthetical keeps its words", () => {
    expect(normalizeSongKey("(Untitled)")).toBe("untitled");
  });

  test("an empty name is an empty key", () => {
    expect(normalizeSongKey("")).toBe("");
  });

  test("the two spellings of one song meet", () => {
    expect(normalizeSongKey("The Beatles")).toBe(normalizeSongKey("beatles"));
    expect(normalizeSongKey("Hey Jude - Remastered 2015")).not.toBe(
      normalizeSongKey("Hey Jude"),
    );
  });
});

describe("foldText", () => {
  test("lowercases, strips accents and apostrophes, keeps everything else", () => {
    expect(foldText("Café Don't (Live)")).toBe("cafe dont (live)");
  });
});

describe("keyTokens", () => {
  test("splits a key into words; an empty key has none", () => {
    expect(keyTokens("let it be")).toEqual(["let", "it", "be"]);
    expect(keyTokens("")).toEqual([]);
  });
});
