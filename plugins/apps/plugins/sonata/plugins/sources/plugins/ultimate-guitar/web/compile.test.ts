import { describe, expect, it } from "bun:test";
import type {
  Annotation,
  ChordAnnotation,
  LyricAnnotation,
  SectionAnnotation,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import type {
  ParsedChord,
  ParsedLine,
  ParsedSection,
  ParsedTab,
  UgTab,
} from "../core";
import {
  collectUnrecognisedChords,
  compile,
  synthesizeScore,
  UG_BEATS_PER_BAR,
  UG_CHARS_PER_BAR,
  UG_DEFAULT_TEMPO_BPM,
} from "./compile";

// --- builders ---------------------------------------------------------------

/** A chord pinned to an explicit lyric column — timing is proportional to it. */
function ch(symbol: string, charOffset: number): ParsedChord {
  return { symbol, charOffset };
}

function line(lyric: string, ...chords: ParsedChord[]): ParsedLine {
  return { lyric, chords };
}

function section(name: string, lines: ParsedLine[]): ParsedSection {
  return { name, lines };
}

function tab(sections: ParsedSection[], key: string | null = null): ParsedTab {
  return { sections, key, capo: 0 };
}

const byType = <T extends string>(score: { annotations: Annotation[] }, type: T) =>
  score.annotations.filter((a) => a.type === type);

const duration = (a: { start: number; end: number }) => a.end - a.start;

// --- tests ------------------------------------------------------------------

describe("synthesizeScore — lyric-proportional, bar-quantized timing", () => {
  it("places two chords proportionally to their column across whole bars", () => {
    // A 24-char lyric → round(24/12) = 2 bars = 8 beats. Chords at columns 0 and
    // 12 land at the proportional beats 0 and (12/24)·8 = 4.
    const lyric = "twenty four characters!!"; // exactly 24 visible chars
    expect(lyric.length).toBe(24);
    const score = synthesizeScore(
      tab([section("Verse", [line(lyric, ch("C", 0), ch("G", 12))])]),
      "Song",
    );

    const chords = byType(score, "chord") as ChordAnnotation[];
    expect(chords).toHaveLength(2);
    expect(chords[0]!.data.symbol).toBe("C");
    expect([chords[0]!.start, chords[0]!.end]).toEqual([0, 4]);
    expect(chords[1]!.data.symbol).toBe("G");
    // The last chord sustains to the line's (bar-quantized) end.
    expect([chords[1]!.start, chords[1]!.end]).toEqual([4, 8]);

    const lyrics = byType(score, "lyric") as LyricAnnotation[];
    expect(lyrics).toHaveLength(1);
    expect(lyrics[0]!.data.text).toBe(lyric);
    expect([lyrics[0]!.start, lyrics[0]!.end]).toEqual([0, 8]);
    // The songsheet line carries both chords by column, with their sounding beat.
    expect(lyrics[0]!.data.chords).toEqual([
      { symbol: "C", charOffset: 0, beat: 0 },
      { symbol: "G", charOffset: 12, beat: 4 },
    ]);

    const sections = byType(score, "section") as SectionAnnotation[];
    expect(sections).toHaveLength(1);
    expect(sections[0]!.data.name).toBe("Verse");
    expect([sections[0]!.start, sections[0]!.end]).toEqual([0, 8]);

    // Annotations only — the shell's re-voicing step owns chord-note generation.
    expect(score.notes).toEqual([]);
    expect(score.tracks).toEqual([]);
  });

  it("gives a chord covering more columns a proportionally longer duration", () => {
    // Columns 0, 4, 20 over a 24-char lyric (2 bars / 8 beats): the middle chord
    // spans columns 4→20 (16 cols) and so must last far longer than the first,
    // which spans 0→4 (4 cols) — the whole point of matching the lyrics.
    const lyric = "twenty four characters!!";
    const score = synthesizeScore(
      tab([
        section("Verse", [
          line(lyric, ch("C", 0), ch("Am", 4), ch("G", 20)),
        ]),
      ]),
    );

    const chords = byType(score, "chord") as ChordAnnotation[];
    expect(chords).toHaveLength(3);
    expect(chords.map((c) => c.data.symbol)).toEqual(["C", "Am", "G"]);
    // 8 beats over 24 cols → 1/3 beat per col.
    expect(chords[0]!.start).toBeCloseTo(0);
    expect(chords[1]!.start).toBeCloseTo((4 / 24) * 8);
    expect(chords[2]!.start).toBeCloseTo((20 / 24) * 8);
    expect(chords[2]!.end).toBe(8); // last chord → line end
    // Wider column span ⇒ longer sounding duration.
    expect(duration(chords[1]!)).toBeGreaterThan(duration(chords[0]!));
    // Chords are contiguous (each sustains until the next change).
    expect(chords[0]!.end).toBeCloseTo(chords[1]!.start);
    expect(chords[1]!.end).toBeCloseTo(chords[2]!.start);
  });

  it("scales line duration by sung length — longer lines get more bars", () => {
    const short = synthesizeScore(
      tab([section("V", [line("short", ch("C", 0))])]),
    );
    // ~48 chars → round(48/12) = 4 bars.
    const longText =
      "a much much longer line of lyrics that keeps going on!!!";
    const long = synthesizeScore(
      tab([section("V", [line(longText, ch("C", 0))])]),
    );

    const shortLyric = (byType(short, "lyric") as LyricAnnotation[])[0]!;
    const longLyric = (byType(long, "lyric") as LyricAnnotation[])[0]!;
    // Both land on a whole-bar boundary…
    expect(duration(shortLyric) % UG_BEATS_PER_BAR).toBe(0);
    expect(duration(longLyric) % UG_BEATS_PER_BAR).toBe(0);
    // …but the longer line lasts longer.
    expect(duration(longLyric)).toBeGreaterThan(duration(shortLyric));
    expect(duration(longLyric)).toBe(
      Math.round(longText.length / UG_CHARS_PER_BAR) * UG_BEATS_PER_BAR,
    );
  });

  it("advances one bar on a blank line and scales a lyric-only line by length", () => {
    const score = synthesizeScore(
      tab([
        section("Verse", [
          line(""), // blank line (no chords, no lyric)
          line("just words here"), // 15 chars → round(15/12) = 1 bar
        ]),
      ]),
    );

    const lyrics = byType(score, "lyric") as LyricAnnotation[];
    // Blank line occupies a bar but emits no lyric; the lyric-only line follows.
    expect(lyrics).toHaveLength(1);
    expect(lyrics[0]!.data.text).toBe("just words here");
    expect([lyrics[0]!.start, lyrics[0]!.end]).toEqual([4, 8]);
    expect(lyrics[0]!.data.chords).toEqual([]);
  });

  it("emits a songsheet line for a chord-only line (empty text, chords populated)", () => {
    // Chord-only / instrumental line: width comes from the chord columns. Cols
    // 0 and 12 → width 13 → 1 bar (4 beats).
    const score = synthesizeScore(
      tab([section("Intro", [line("", ch("C", 0), ch("G", 12))])]),
    );

    const lyrics = byType(score, "lyric") as LyricAnnotation[];
    expect(lyrics).toHaveLength(1);
    expect(lyrics[0]!.data.text).toBe("");
    expect([lyrics[0]!.start, lyrics[0]!.end]).toEqual([0, 4]);
    expect(lyrics[0]!.data.chords).toEqual([
      { symbol: "C", charOffset: 0, beat: 0 },
      { symbol: "G", charOffset: 12, beat: (12 / 13) * 4 },
    ]);
  });

  it("emits no section annotation for an implicit (name:'') section", () => {
    const score = synthesizeScore(
      tab([section("", [line("intro lyric", ch("C", 0))])]),
    );

    expect(byType(score, "section")).toHaveLength(0);
    // chords + lyrics still emitted
    expect(byType(score, "chord")).toHaveLength(1);
    expect(byType(score, "lyric")).toHaveLength(1);
  });

  it("skips an unrecognised chord but keeps the next chord's proportional slot", () => {
    // "N.C." at col 0 is unrecognised → no chord/note. "G" at col 8 must still
    // land at its own proportional beat, unaffected by the dropped symbol.
    const score = synthesizeScore(
      tab([section("Verse", [line("", ch("N.C.", 0), ch("G", 8))])]),
    );

    const chords = byType(score, "chord") as ChordAnnotation[];
    expect(chords).toHaveLength(1);
    expect(chords[0]!.data.symbol).toBe("G");
    // width = 9 (last col 8 + 1) → round(9/12) = 1 bar = 4 beats.
    expect(chords[0]!.start).toBeCloseTo((8 / 9) * 4);
    expect(chords[0]!.end).toBe(4);
  });

  it("parses a slash chord into a chord annotation carrying the bass", () => {
    const score = synthesizeScore(
      tab([section("Verse", [line("", ch("G/B", 0))])]),
    );

    const chords = byType(score, "chord") as ChordAnnotation[];
    expect(chords).toHaveLength(1);
    expect(chords[0]!.data.symbol).toBe("G/B");
    expect(chords[0]!.data.bass).toBe(11);
    // A single chord fills its whole (1-bar) line.
    expect([chords[0]!.start, chords[0]!.end]).toEqual([0, 4]);
  });

  it("sets tempoMap / timeSigMap and parses meta.key + meta.title", () => {
    const score = synthesizeScore(
      tab([section("Verse", [line("la", ch("Am", 0))])], "Am"),
      "My Song",
    );

    expect(score.tempoMap).toEqual([{ beat: 0, bpm: UG_DEFAULT_TEMPO_BPM }]);
    expect(score.timeSigMap).toEqual([
      { beat: 0, numerator: 4, denominator: 4 },
    ]);
    expect(score.meta.key).toEqual({ tonic: "A", mode: "minor" });
    expect(score.meta.title).toBe("My Song");
    expect(UG_BEATS_PER_BAR).toBe(4);
  });

  it("produces a structurally valid empty Score for an empty tab", () => {
    const score = synthesizeScore(tab([]));

    expect(score.notes).toEqual([]);
    expect(score.annotations).toEqual([]);
    expect(score.tempoMap).toEqual([{ beat: 0, bpm: UG_DEFAULT_TEMPO_BPM }]);
    expect(score.timeSigMap).toEqual([
      { beat: 0, numerator: 4, denominator: 4 },
    ]);
    expect(score.tracks).toEqual([]);
    expect(score.meta.key).toBeUndefined();
    expect(score.meta.title).toBeUndefined();
  });
});

describe("collectUnrecognisedChords — dropped-chord surfacing", () => {
  it("returns the symbols synthesizeScore drops, deduped in first-seen order", () => {
    const parsed = tab([
      section("Verse", [
        line("", ch("N.C.", 0), ch("C", 4), ch("???", 8), ch("G", 12)),
      ]),
      // "N.C." repeats → deduped
      section("Chorus", [line("", ch("N.C.", 0), ch("Am", 8))]),
    ]);

    expect(collectUnrecognisedChords(parsed)).toEqual(["N.C.", "???"]);
  });

  it("agrees with synthesizeScore about what is dropped", () => {
    const parsed = tab([section("Verse", [line("", ch("N.C.", 0), ch("G", 8))])]);

    const dropped = collectUnrecognisedChords(parsed);
    const kept = (
      byType(synthesizeScore(parsed), "chord") as ChordAnnotation[]
    ).map((c) => c.data.symbol);

    expect(dropped).toEqual(["N.C."]);
    expect(kept).toEqual(["G"]);
  });

  it("returns an empty list when every chord is recognised", () => {
    expect(
      collectUnrecognisedChords(
        tab([section("Verse", [line("", ch("C", 0), ch("G/B", 8))])]),
      ),
    ).toEqual([]);
  });
});

describe("compile — UgTab round-trip", () => {
  it("validates the raw shape, parses the markup, and synthesizes a Score", () => {
    const ugTab: UgTab = {
      tabId: "123",
      songName: "Hey Jude",
      artistName: "The Beatles",
      type: "Chords",
      key: "F",
      capo: 0,
      tuning: "E A D G B E",
      content: "[Verse]\n[ch]C[/ch] [ch]G[/ch]\nhello there friend",
      urlWeb: "https://tabs.ultimate-guitar.com/tab/123",
    };

    const score = compile(ugTab);

    expect(score.meta.title).toBe("Hey Jude");
    expect(score.meta.key).toEqual({ tonic: "F", mode: "major" });
    expect((byType(score, "chord") as ChordAnnotation[]).map((c) => c.data.symbol)).toEqual([
      "C",
      "G",
    ]);
    expect((byType(score, "lyric") as LyricAnnotation[])[0]!.data.text).toBe(
      "hello there friend",
    );
    expect(score.notes).toEqual([]);
  });

  it("throws on a malformed raw shape (loud failure)", () => {
    expect(() => compile({ songName: 5 })).toThrow();
  });
});
