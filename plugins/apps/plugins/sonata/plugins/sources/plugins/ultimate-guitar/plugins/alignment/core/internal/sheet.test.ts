import { describe, expect, it } from "bun:test";
import { parseUgTab } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import { parsedSheet } from "../testing";
import { buildAlignSheet, normalizeSectionName } from "./sheet";

/** A parsed tab from raw UG markup. */
const fromMarkup = (content: string) =>
  parseUgTab({
    tabId: "1",
    songName: "",
    artistName: "",
    type: "Chords",
    key: null,
    capo: 0,
    tuning: "",
    content,
    urlWeb: "",
  });

const chordsOf = (
  sheet: ReturnType<typeof buildAlignSheet>,
  b: number,
): string =>
  sheet.blocks[b]!.tokens.map((t) => `${t.section}/${t.line}/${t.chord}`).join(
    " ",
  );

describe("normalizeSectionName", () => {
  it("drops numbers, punctuation and repeat counts", () => {
    expect(normalizeSectionName("Chorus 2")).toBe("chorus");
    expect(normalizeSectionName("Pre-Chorus")).toBe("prechorus");
    expect(normalizeSectionName("Verse 1 x2")).toBe("verse");
    expect(normalizeSectionName("Chorus (x3)")).toBe("chorus");
  });
});

describe("buildAlignSheet", () => {
  it("lets an empty header inherit the chords of the same-named section, pointing where they are written", () => {
    const sheet = buildAlignSheet(
      parsedSheet([
        { name: "Chorus 1", lines: ["Am F"] },
        { name: "Verse", lines: ["C G"] },
        { name: "Chorus 2", lines: [{ lyric: "(same as before)" }] },
        { name: "Bridge", lines: [] },
      ]),
    );
    // The bridge names nothing written: it has no block.
    expect(sheet.blocks.map((b) => b.name)).toEqual([
      "chorus",
      "verse",
      "chorus",
    ]);
    expect(chordsOf(sheet, 2)).toBe(chordsOf(sheet, 0));
    expect(sheet.blocks[2]!.section).toBe(0);
    // Shapes are deduplicated.
    expect(sheet.shapes).toHaveLength(4);
  });

  it("unrolls a line marked x4, with skips past the remaining copies", () => {
    const sheet = buildAlignSheet(
      fromMarkup("[Intro]\n[ch]Em7[/ch] [ch]G[/ch]   x4\n[ch]C[/ch]"),
    );
    const block = sheet.blocks[0]!;
    expect(block.tokens).toHaveLength(9);
    expect(chordsOf(sheet, 0)).toBe(
      "0/0/0 0/0/1 0/0/0 0/0/1 0/0/0 0/0/1 0/0/0 0/0/1 0/1/0",
    );
    expect(block.skips).toEqual([
      { from: 1, to: 8 },
      { from: 3, to: 8 },
      { from: 5, to: 8 },
    ]);
  });

  it("reads a count on the line under a chord line, and lets a repeated last line leave the block", () => {
    const sheet = buildAlignSheet(
      parsedSheet([
        { name: "Outro", lines: ["C G", { lyric: "la la" }, { lyric: "x2" }] },
      ]),
    );
    expect(sheet.blocks[0]!.tokens).toHaveLength(4);
    expect(sheet.blocks[0]!.skips).toEqual([{ from: 1, to: 4 }]);
  });

  it("marks a section named with a count as repeating", () => {
    const sheet = buildAlignSheet(
      parsedSheet([{ name: "Chorus x2", lines: ["C"] }]),
    );
    expect(sheet.blocks[0]!.repeatHint).toBe(true);
  });

  it("skips chord-diagram lines and keeps an unreadable symbol as a token without a shape", () => {
    const sheet = buildAlignSheet(
      fromMarkup(
        "[ch]Em7[/ch]  0-2-2-0-3-3\n\n[Verse]\n[ch]C[/ch] [ch]N.C.[/ch]",
      ),
    );
    expect(sheet.blocks).toHaveLength(1);
    expect(sheet.blocks[0]!.tokens.map((t) => t.shape === null)).toEqual([
      false,
      true,
    ]);
  });

  it("throws on a sheet without chords", () => {
    expect(() =>
      buildAlignSheet(
        parsedSheet([{ name: "Verse", lines: [{ lyric: "words" }] }]),
      ),
    ).toThrow(/no chords/);
  });
});
