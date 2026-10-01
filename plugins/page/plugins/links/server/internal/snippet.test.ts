import { describe, expect, test } from "bun:test";
import { deriveSnippet, SNIPPET_CONTEXT } from "./snippet";

describe("deriveSnippet", () => {
  test("splits an inline link's text around the target's title", () => {
    expect(
      deriveSnippet(
        "Ear training every morning — see Chords for the plan.",
        "Chords",
      ),
    ).toEqual({
      before: "Ear training every morning — see ",
      match: "Chords",
      after: " for the plan.",
    });
  });

  test("null when the block IS the link (its text is only the title)", () => {
    expect(deriveSnippet("  Chords  ", "Chords")).toBeNull();
  });

  test("null when the block has no text (a page-link block)", () => {
    expect(deriveSnippet("", "Chords")).toBeNull();
  });

  test("null when the text does not name the target", () => {
    expect(deriveSnippet("Something else entirely", "Chords")).toBeNull();
  });

  test("marks the first occurrence", () => {
    const s = deriveSnippet("A then A again", "A");
    expect(s).toEqual({ before: "", match: "A", after: " then A again" });
  });

  test("collapses newlines and whitespace runs to one line", () => {
    expect(deriveSnippet("line one\n\nsee   Chords\tnow", "Chords")).toEqual({
      before: "line one see ",
      match: "Chords",
      after: " now",
    });
  });

  test("trims long context on word boundaries, marking the cuts", () => {
    const words = (n: number, w: string) => Array(n).fill(w).join(" ");
    const text = `${words(40, "before")} Chords ${words(40, "after")}`;
    const s = deriveSnippet(text, "Chords")!;
    expect(s.match).toBe("Chords");
    expect(s.before.startsWith("…")).toBe(true);
    expect(s.after.endsWith("…")).toBe(true);
    // Whole words only on both sides.
    expect(
      s.before
        .slice(1)
        .split(" ")
        .slice(0, -1)
        .every((w) => w === "before"),
    ).toBe(true);
    expect(
      s.after
        .slice(0, -1)
        .trim()
        .split(" ")
        .every((w) => w === "after"),
    ).toBe(true);
    // ~80 characters of context in all (a word's slack either side).
    const context = s.before.length + s.after.length;
    expect(context).toBeLessThanOrEqual(SNIPPET_CONTEXT + 2);
    expect(context).toBeGreaterThan(SNIPPET_CONTEXT - 20);
  });

  test("a short side hands its unused budget to the other", () => {
    const tail = Array(30).fill("word").join(" ");
    const s = deriveSnippet(`See Chords ${tail}`, "Chords")!;
    expect(s.before).toBe("See ");
    // More than half the budget went after the match.
    expect(s.after.length).toBeGreaterThan(SNIPPET_CONTEXT / 2);
  });
});
