import { describe, expect, test } from "bun:test";
import { hooktheorySlugs } from "./hooktheory-slug";

// Real (name, slug) pairs from main's chord_sections.
describe("hooktheorySlugs", () => {
  test.each([
    ["The Beatles", "the-beatles"],
    ["Beatles", "beatles"],
    ["Don't Stop Me Now", "dont-stop-me-now"],
    ["Raindrops Keep Fallin' On My Head", "raindrops-keep-fallin-on-my-head"],
    ["Darius and Finlay", "darius-and-finlay"],
    ["Copacabana (At The Copa)", "copacabana-%28at-the-copa%29"],
    [
      "Kass' Theme - Zelda Breath of the Wild",
      "kass-theme---zelda-breath-of-the-wild",
    ],
    ["Hyadain-", "hyadain-"],
    ["Thank God 9-11 Wasn't on Christmas", "thank-god-9-11-wasnt-on-christmas"],
  ])("%p is filed under %p", (name, slug) => {
    expect(hooktheorySlugs(name)).toContain(slug);
  });

  test("a leading 'The' is tried both ways", () => {
    expect(hooktheorySlugs("The Beatles")).toEqual(
      expect.arrayContaining(["the-beatles", "beatles"]),
    );
    expect(hooktheorySlugs("Beatles")).toEqual(
      expect.arrayContaining(["the-beatles", "beatles"]),
    );
  });

  test("& is tried as 'and' and dropped; accents fold", () => {
    expect(hooktheorySlugs("Simon & Garfunkel")).toEqual(
      expect.arrayContaining(["simon-and-garfunkel", "simon-garfunkel"]),
    );
    expect(hooktheorySlugs("Beyoncé")).toContain("beyonce");
  });

  test("a parenthetical is tried with and without", () => {
    expect(hooktheorySlugs("Wonderwall (Remastered)")).toEqual(
      expect.arrayContaining(["wonderwall-%28remastered%29", "wonderwall"]),
    );
  });

  test("a name with nothing to slug gives none", () => {
    expect(hooktheorySlugs("!!!")).toEqual([]);
  });
});
