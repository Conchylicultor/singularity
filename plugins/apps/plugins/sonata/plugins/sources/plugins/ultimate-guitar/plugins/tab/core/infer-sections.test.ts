import { describe, expect, it } from "bun:test";
import { inferSections } from "./infer-sections";
import { parseUgContent } from "./parse";

const tab = (content: string) => ({
  sections: parseUgContent(content),
  key: null,
  capo: 0,
});

/** A stanza of chord-over-lyric lines, chords space-separated per line. */
const stanza = (...lines: [chords: string, lyric: string][]) =>
  lines
    .map(
      ([chords, lyric]) =>
        `${chords
          .split(" ")
          .map((c) => `[ch]${c}[/ch]`)
          .join(" ")}\n${lyric}`,
    )
    .join("\n");

const VERSE = (w: string) =>
  stanza(
    ["C Cmaj7 F", `${w} one`],
    ["C Cmaj7 F", `${w} two`],
    ["F Am Dm", `${w} three`],
    ["G G7", `${w} four`],
  );
const REFRAIN = (last: string) =>
  stanza(
    ["F G C E7", "You may say"],
    ["F G C E7", "But I'm not"],
    [last, "And the world"],
  );

describe("inferSections", () => {
  it("labels an untagged song's stanzas by chord repetition (Imagine)", () => {
    const content = [
      "Imagine chords\nJohn Lennon 1971",
      "[ch]C[/ch] [ch]Cmaj7[/ch] [ch]F[/ch]  x2",
      VERSE("heaven"),
      VERSE("countries"),
      REFRAIN("F G C"),
      VERSE("possessions"),
      // One chord more on the last line: still the same section.
      REFRAIN("F G C E7"),
      "* Alternates:\nCapo III\n[ch]C[/ch] = [ch]A[/ch]",
    ].join("\n\n");
    const parsed = tab(content);
    expect(inferSections(parsed).map((s) => s.label)).toEqual([
      "Intro",
      "A",
      "A",
      "B",
      "A",
      "B",
    ]);
    // Spans are the stanza's own lines.
    const [, first] = inferSections(parsed);
    const lines = parsed.sections[first!.section]!.lines.slice(
      first!.from,
      first!.to,
    );
    expect(lines.map((l) => l.lyric)).toEqual([
      "heaven one",
      "heaven two",
      "heaven three",
      "heaven four",
    ]);
  });

  it("names a lone closing chords-only stanza Outro, and a repeated one a letter", () => {
    const outro = tab([VERSE("a"), "[ch]C[/ch] [ch]G[/ch]"].join("\n\n"));
    expect(inferSections(outro).map((s) => s.label)).toEqual(["A", "Outro"]);
    const riff = "[ch]Am[/ch] [ch]E[/ch]";
    const repeated = tab([riff, VERSE("a"), riff].join("\n\n"));
    expect(inferSections(repeated).map((s) => s.label)).toEqual([
      "A",
      "B",
      "A",
    ]);
  });

  it("infers nothing when the tab names any section", () => {
    expect(
      inferSections(tab(`${VERSE("a")}\n\n[Chorus]\n${REFRAIN("F")}`)),
    ).toEqual([]);
  });

  it("gives one stanza with no blank lines one label", () => {
    expect(inferSections(tab(VERSE("a"))).map((s) => s.label)).toEqual(["A"]);
  });
});
