import { describe, expect, it } from "bun:test";
import {
  parseUgContent,
  parseUgTab,
  UgParseError,
  type ParsedSection,
} from "./parse";
import type { UgTab } from "./raw-tab";

/** Catch a thrown value so we can assert on its type/kind. */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe("parseUgContent — chords above lyrics", () => {
  it("aligns each chord to the column it sits over in the lyric below", () => {
    // "When I find my[s]elf…" — G sits at column 14 ('s' of "myself").
    const content = "[Verse]\n[ch]C[/ch]              [ch]G[/ch]\nWhen I find myself in times of trouble";
    const sections = parseUgContent(content);

    expect(sections).toHaveLength(1);
    expect(sections[0]!.name).toBe("Verse");
    expect(sections[0]!.lines).toHaveLength(1);

    const line = sections[0]!.lines[0]!;
    expect(line.lyric).toBe("When I find myself in times of trouble");
    expect(line.chords).toEqual([
      { symbol: "C", charOffset: 0 },
      { symbol: "G", charOffset: 14 },
    ]);
  });

  it("treats [tab]/[/tab] wrappers as zero-width so columns still align", () => {
    const content =
      "[Verse]\n[tab][ch]C[/ch]              [ch]G[/ch]\nWhen I find myself in times of trouble[/tab]";
    const line = parseUgContent(content)[0]!.lines[0]!;

    expect(line.lyric).toBe("When I find myself in times of trouble");
    expect(line.chords).toEqual([
      { symbol: "C", charOffset: 0 },
      { symbol: "G", charOffset: 14 },
    ]);
  });

  it("pairs only with the immediately-following line (a blank breaks pairing)", () => {
    const content = "[ch]C[/ch]\n\nlater lyric";
    const lines = parseUgContent(content)[0]!.lines;

    expect(lines).toEqual([
      { chords: [{ symbol: "C", charOffset: 0 }], lyric: "" },
      { chords: [], lyric: "later lyric" },
    ]);
  });

  it("emits a chord-only line when the next line is itself a chord line", () => {
    // Markup is zero-width, so on a chord-only line offsets reflect only the
    // literal inter-chord whitespace (a single space here), not chord widths.
    const content = "[Intro]\n[ch]C[/ch] [ch]G[/ch]\n[ch]Am[/ch] [ch]F[/ch]";
    const lines = parseUgContent(content)[0]!.lines;

    expect(lines).toEqual([
      {
        chords: [
          { symbol: "C", charOffset: 0 },
          { symbol: "G", charOffset: 1 },
        ],
        lyric: "",
      },
      {
        chords: [
          { symbol: "Am", charOffset: 0 },
          { symbol: "F", charOffset: 1 },
        ],
        lyric: "",
      },
    ]);
  });
});

describe("parseUgContent — inline chords", () => {
  it("keeps inline chords on one line with offsets into the residual lyric", () => {
    const content = "[ch]C[/ch]I once [ch]G[/ch]was lost";
    const line = parseUgContent(content)[0]!.lines[0]!;

    expect(line.lyric).toBe("I once was lost");
    expect(line.chords).toEqual([
      { symbol: "C", charOffset: 0 }, // over "I"
      { symbol: "G", charOffset: 7 }, // over "was"
    ]);
  });
});

describe("parseUgContent — sections", () => {
  it("opens an implicit empty-named leading section before the first header", () => {
    const content = "[ch]C[/ch]\nintro line\n[Verse]\nverse line";
    const sections = parseUgContent(content);

    expect(sections.map((s: ParsedSection) => s.name)).toEqual(["", "Verse"]);
    expect(sections[0]!.lines).toEqual([
      { chords: [{ symbol: "C", charOffset: 0 }], lyric: "intro line" },
    ]);
    expect(sections[1]!.lines).toEqual([{ chords: [], lyric: "verse line" }]);
  });

  it("preserves section order and repeated same-named sections as distinct blocks", () => {
    const content = "[Chorus]\nla la\n[Verse]\nwords\n[Chorus]\nla la";
    expect(parseUgContent(content).map((s: ParsedSection) => s.name)).toEqual([
      "Chorus",
      "Verse",
      "Chorus",
    ]);
  });

  it("keeps a header with multi-word labels and no body as an empty section", () => {
    const content = "[Verse 1]\nwords\n[Guitar Solo]";
    const sections = parseUgContent(content);

    expect(sections.map((s: ParsedSection) => s.name)).toEqual([
      "Verse 1",
      "Guitar Solo",
    ]);
    expect(sections[1]!.lines).toEqual([]);
  });

  it("does not mistake a chord-only line for a section header", () => {
    const sections = parseUgContent("[ch]Am[/ch]");
    expect(sections).toHaveLength(1);
    expect(sections[0]!.name).toBe("");
    expect(sections[0]!.lines).toEqual([
      { chords: [{ symbol: "Am", charOffset: 0 }], lyric: "" },
    ]);
  });
});

describe("parseUgContent — misc", () => {
  it("returns no sections for empty / whitespace-only content", () => {
    expect(parseUgContent("")).toEqual([]);
    expect(parseUgContent("   \n\n  \n")).toEqual([]);
  });

  it("trims trailing whitespace but preserves leading columns of a lyric", () => {
    // Leading spaces in the lyric keep the chord alignment honest.
    const content = "[ch]C[/ch]  \n  indented lyric   ";
    const line = parseUgContent(content)[0]!.lines[0]!;
    expect(line.lyric).toBe("  indented lyric");
    expect(line.chords[0]!.charOffset).toBe(0);
  });

  it("handles CRLF line endings", () => {
    const content = "[Verse]\r\n[ch]C[/ch]\r\nhello";
    const sections = parseUgContent(content);
    expect(sections[0]!.name).toBe("Verse");
    expect(sections[0]!.lines).toEqual([
      { chords: [{ symbol: "C", charOffset: 0 }], lyric: "hello" },
    ]);
  });

  it("trims whitespace inside a chord token", () => {
    expect(parseUgContent("[ch] C [/ch]")[0]!.lines[0]!.chords).toEqual([
      { symbol: "C", charOffset: 0 },
    ]);
  });

  it("does not treat a bracketed word inside a lyric line as a section", () => {
    const content = "she said [stop] and left";
    const sections = parseUgContent(content);
    expect(sections[0]!.name).toBe("");
    expect(sections[0]!.lines).toEqual([
      { chords: [], lyric: "she said [stop] and left" },
    ]);
  });
});

describe("parseUgContent — fail loud", () => {
  it("throws unbalanced-chord on an unterminated [ch]", () => {
    const err = thrown(() => parseUgContent("[ch]C\nlyric"));
    expect(err).toBeInstanceOf(UgParseError);
    expect((err as UgParseError).kind).toBe("unbalanced-chord");
  });

  it("throws unbalanced-chord on a stray [/ch]", () => {
    const err = thrown(() => parseUgContent("C[/ch] lyric"));
    expect(err).toBeInstanceOf(UgParseError);
    expect((err as UgParseError).kind).toBe("unbalanced-chord");
  });

  it("throws unbalanced-chord on a nested [ch]", () => {
    const err = thrown(() => parseUgContent("[ch]C[ch]G[/ch][/ch]"));
    expect(err).toBeInstanceOf(UgParseError);
    expect((err as UgParseError).kind).toBe("unbalanced-chord");
  });

  it("throws empty-chord on [ch][/ch]", () => {
    const err = thrown(() => parseUgContent("[ch][/ch]"));
    expect(err).toBeInstanceOf(UgParseError);
    expect((err as UgParseError).kind).toBe("empty-chord");
  });

  it("throws unbalanced-tab when [tab] blocks do not balance", () => {
    const err = thrown(() => parseUgContent("[tab][ch]C[/ch]\nlyric"));
    expect(err).toBeInstanceOf(UgParseError);
    expect((err as UgParseError).kind).toBe("unbalanced-tab");
  });
});

describe("parseUgTab", () => {
  const tab: UgTab = {
    tabId: "3250376",
    songName: "Let It Be",
    artistName: "The Beatles",
    type: "Chords",
    key: "C",
    capo: 2,
    tuning: "E A D G B E",
    content: "[Verse]\n[ch]C[/ch]\nWhen I find",
    urlWeb: "https://tabs.ultimate-guitar.com/tab/the-beatles/let-it-be-3250376",
  };

  it("parses content into sections and carries key/capo through from metadata", () => {
    const parsed = parseUgTab(tab);
    expect(parsed.key).toBe("C");
    expect(parsed.capo).toBe(2);
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0]!.name).toBe("Verse");
    expect(parsed.sections[0]!.lines).toEqual([
      { chords: [{ symbol: "C", charOffset: 0 }], lyric: "When I find" },
    ]);
  });

  it("passes a null key through unchanged", () => {
    expect(parseUgTab({ ...tab, key: null }).key).toBeNull();
  });
});
