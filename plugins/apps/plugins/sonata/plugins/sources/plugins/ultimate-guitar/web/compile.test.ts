import { describe, expect, it } from "bun:test";
import type {
  Annotation,
  ChordAnnotation,
  LyricAnnotation,
  SectionAnnotation,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import type {
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
  UG_DEFAULT_TEMPO_BPM,
  UG_TRACK,
} from "./compile";

// --- builders ---------------------------------------------------------------

function line(lyric: string, ...chords: string[]): ParsedLine {
  return {
    lyric,
    chords: chords.map((symbol, i) => ({ symbol, charOffset: i })),
  };
}

function section(name: string, lines: ParsedLine[]): ParsedSection {
  return { name, lines };
}

function tab(sections: ParsedSection[], key: string | null = null): ParsedTab {
  return { sections, key, capo: 0 };
}

const byType = <T extends string>(score: { annotations: Annotation[] }, type: T) =>
  score.annotations.filter((a) => a.type === type);

// --- tests ------------------------------------------------------------------

describe("synthesizeScore — chord-per-bar timing", () => {
  it("lays a 2-chord verse line out across two bars with a spanning lyric", () => {
    const score = synthesizeScore(
      tab([section("Verse", [line("hello world", "C", "G")])]),
      "Song",
    );

    const chords = byType(score, "chord") as ChordAnnotation[];
    expect(chords).toHaveLength(2);
    expect(chords[0]!.data.symbol).toBe("C");
    expect([chords[0]!.start, chords[0]!.end]).toEqual([0, 4]);
    expect(chords[1]!.data.symbol).toBe("G");
    expect([chords[1]!.start, chords[1]!.end]).toEqual([4, 8]);

    const lyrics = byType(score, "lyric") as LyricAnnotation[];
    expect(lyrics).toHaveLength(1);
    expect(lyrics[0]!.data.text).toBe("hello world");
    expect([lyrics[0]!.start, lyrics[0]!.end]).toEqual([0, 8]);
    // The songsheet line carries both chords by column, with their sounding beat.
    expect(lyrics[0]!.data.chords).toEqual([
      { symbol: "C", charOffset: 0, beat: 0 },
      { symbol: "G", charOffset: 1, beat: 4 },
    ]);

    const sections = byType(score, "section") as SectionAnnotation[];
    expect(sections).toHaveLength(1);
    expect(sections[0]!.data.name).toBe("Verse");
    expect([sections[0]!.start, sections[0]!.end]).toEqual([0, 8]);

    expect(score.notes.length).toBeGreaterThan(0);
    expect(score.notes.every((n) => n.track === UG_TRACK)).toBe(true);
  });

  it("advances exactly one bar on a lyric-only line and emits its lyric", () => {
    const score = synthesizeScore(
      tab([
        section("Verse", [
          line(""), // chord-only would be empty; this is a pure lyric line below
          line("just words here"),
        ]),
      ]),
    );

    const lyrics = byType(score, "lyric") as LyricAnnotation[];
    // First line is blank (no chords, empty lyric) → occupies a bar, no lyric.
    // Second line is lyric-only → one lyric annotation spanning [4, 8].
    expect(lyrics).toHaveLength(1);
    expect(lyrics[0]!.data.text).toBe("just words here");
    expect([lyrics[0]!.start, lyrics[0]!.end]).toEqual([4, 8]);
    // A lyric-only line carries no chords.
    expect(lyrics[0]!.data.chords).toEqual([]);
  });

  it("emits a songsheet line for a chord-only line (empty text, chords populated)", () => {
    const score = synthesizeScore(
      tab([section("Intro", [line("", "C", "G")])]),
    );

    const lyrics = byType(score, "lyric") as LyricAnnotation[];
    // Chord-only / instrumental line still produces a songsheet line so it
    // renders (and scrolls) — text empty, chords carried by column + beat.
    expect(lyrics).toHaveLength(1);
    expect(lyrics[0]!.data.text).toBe("");
    expect([lyrics[0]!.start, lyrics[0]!.end]).toEqual([0, 8]);
    expect(lyrics[0]!.data.chords).toEqual([
      { symbol: "C", charOffset: 0, beat: 0 },
      { symbol: "G", charOffset: 1, beat: 4 },
    ]);
  });

  it("emits no section annotation for an implicit (name:'') section", () => {
    const score = synthesizeScore(
      tab([section("", [line("intro lyric", "C")])]),
    );

    expect(byType(score, "section")).toHaveLength(0);
    // chords + lyrics still emitted
    expect(byType(score, "chord")).toHaveLength(1);
    expect(byType(score, "lyric")).toHaveLength(1);
  });

  it("skips an unrecognised chord but still advances the bar", () => {
    const score = synthesizeScore(
      tab([section("Verse", [line("", "N.C.", "G")])]),
    );

    const chords = byType(score, "chord") as ChordAnnotation[];
    // "N.C." is unrecognised → no event; "G" must still land on bar 2.
    expect(chords).toHaveLength(1);
    expect(chords[0]!.data.symbol).toBe("G");
    expect([chords[0]!.start, chords[0]!.end]).toEqual([4, 8]);
  });

  it("parses a slash chord into a chord annotation + notes", () => {
    const score = synthesizeScore(
      tab([section("Verse", [line("", "G/B")])]),
    );

    const chords = byType(score, "chord") as ChordAnnotation[];
    expect(chords).toHaveLength(1);
    expect(chords[0]!.data.symbol).toBe("G/B");
    expect(chords[0]!.data.bass).toBe(11);
    expect(score.notes.length).toBeGreaterThan(0);
  });

  it("sets tempoMap / timeSigMap and parses meta.key + meta.title", () => {
    const score = synthesizeScore(
      tab([section("Verse", [line("la", "Am")])], "Am"),
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
    expect(score.tracks).toEqual([{ id: UG_TRACK, name: "Ultimate Guitar" }]);
    expect(score.meta.key).toBeUndefined();
    expect(score.meta.title).toBeUndefined();
  });
});

describe("collectUnrecognisedChords — dropped-chord surfacing", () => {
  it("returns the symbols synthesizeScore drops, deduped in first-seen order", () => {
    const parsed = tab([
      section("Verse", [line("", "N.C.", "C", "???", "G")]),
      section("Chorus", [line("", "N.C.", "Am")]), // "N.C." repeats → deduped
    ]);

    expect(collectUnrecognisedChords(parsed)).toEqual(["N.C.", "???"]);
  });

  it("agrees with synthesizeScore about what is dropped", () => {
    const parsed = tab([section("Verse", [line("", "N.C.", "G")])]);

    const dropped = collectUnrecognisedChords(parsed);
    const kept = (
      byType(synthesizeScore(parsed), "chord") as ChordAnnotation[]
    ).map((c) => c.data.symbol);

    expect(dropped).toEqual(["N.C."]);
    expect(kept).toEqual(["G"]);
  });

  it("returns an empty list when every chord is recognised", () => {
    expect(
      collectUnrecognisedChords(tab([section("Verse", [line("", "C", "G/B")])])),
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
    expect(score.notes.length).toBeGreaterThan(0);
  });

  it("throws on a malformed raw shape (loud failure)", () => {
    expect(() => compile({ songName: 5 })).toThrow();
  });
});
