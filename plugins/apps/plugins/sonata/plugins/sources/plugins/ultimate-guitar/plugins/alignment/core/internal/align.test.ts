import { describe, expect, it } from "bun:test";
import type { BeatFeatures } from "@plugins/infra/plugins/audio-analysis/core";
import type { ParsedTab } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import { parsedSheet, synthFeatures } from "../testing";
import { alignChords } from "./align";
import { WEAK_MATCH_THRESHOLD, type AlignmentRecord } from "./record";

const OPTS = { capo: 0, sheetHash: "h", settingsKey: "test" };

/** One symbol per beat: each chord held for `beats` beats. */
function played(
  chords: readonly (string | null)[],
  beats = 4,
): (string | null)[] {
  return chords.flatMap((c) => Array.from({ length: beats }, () => c));
}

/** The chord segments as `symbol@startBeat`, in performance order. */
function timeline(parsed: ParsedTab, record: AlignmentRecord): string[] {
  return record.segments.map((seg) =>
    seg.kind === "gap"
      ? `gap@${seg.startBeat}`
      : `${parsed.sections[seg.section]!.lines[seg.line]!.chords[seg.chord]!.symbol}@${seg.startBeat}`,
  );
}

/** Where each section occurrence starts: `name#occurrence@startBeat`. */
function sections(parsed: ParsedTab, record: AlignmentRecord): string[] {
  const out: string[] = [];
  let last = "";
  for (const seg of record.segments) {
    const key =
      seg.kind === "gap"
        ? `gap@${seg.startBeat}`
        : `${parsed.sections[seg.section]!.name}#${seg.occurrence}`;
    if (seg.kind === "gap") out.push(key);
    else if (key !== last) out.push(`${key}@${seg.startBeat}`);
    last = key;
  }
  return out;
}

/** The segments tile `[0, beats)` with no hole or overlap. */
function expectContiguous(record: AlignmentRecord): void {
  let at = 0;
  for (const seg of record.segments) {
    expect(seg.startBeat).toBe(at);
    expect(seg.endBeat).toBeGreaterThan(seg.startBeat);
    at = seg.endBeat;
  }
  expect(at).toBe(record.beats.length);
}

const VERSE = ["C G Am F", "C G F C"];
const CHORUS = ["Am F C G", "Am F G G7"];

describe("alignChords", () => {
  it("lands a sheet played straight on its beats, untransposed, with a high score", () => {
    const parsed = parsedSheet([
      { name: "Verse", lines: VERSE },
      { name: "Chorus", lines: CHORUS },
    ]);
    const performed = [
      "C",
      "G",
      "Am",
      "F",
      "C",
      "G",
      "F",
      "C",
      "Am",
      "F",
      "C",
      "G",
      "Am",
      "F",
      "G",
      "G7",
    ];
    const features = synthFeatures(played(performed));
    const record = alignChords(parsed, features, OPTS);

    expect(record.transpose).toBe(0);
    expectContiguous(record);
    expect(timeline(parsed, record)).toEqual(
      performed.map((c, i) => `${c}@${i * 4}`),
    );
    expect(record.score).toBeGreaterThan(0.8);
    expect(record.barConfidence).toHaveLength(performed.length);
    expect(Math.min(...record.barConfidence)).toBeGreaterThan(0.5);
    // The record carries its inputs.
    expect(record.videoId).toBe("synthetic");
    expect(record.sheetHash).toBe("h");
    expect(record.settingsKey).toBe("test");
    expect(record.beats).toHaveLength(features.beats.length);
  });

  it("expands a repeated chorus, and an empty [Chorus] header inherits its chords", () => {
    const parsed = parsedSheet([
      { name: "Verse 1", lines: VERSE },
      { name: "Chorus", lines: CHORUS },
      { name: "Verse 2", lines: VERSE },
      { name: "Chorus", lines: [{ lyric: "(repeat)" }] },
    ]);
    const verse = ["C", "G", "Am", "F", "C", "G", "F", "C"];
    const chorus = ["Am", "F", "C", "G", "Am", "F", "G", "G7"];
    const features = synthFeatures(
      played([...verse, ...chorus, ...verse, ...chorus, ...chorus]),
    );
    const record = alignChords(parsed, features, OPTS);

    expectContiguous(record);
    expect(sections(parsed, record)).toEqual([
      "Verse 1#0@0",
      "Chorus#0@32",
      "Verse 2#0@64",
      // The inherited occurrences name the chords where they are written (section 1).
      "Chorus#1@96",
      "Chorus#2@128",
    ]);
    for (const seg of record.segments) {
      if (seg.kind === "chord") expect(seg.section).not.toBe(3);
    }
    expect(record.score).toBeGreaterThan(0.8);
  });

  it("plays a line marked x3 three times, and fewer when the recording does", () => {
    const parsed = parsedSheet([
      { name: "Intro", lines: ["Em7 G Dsus4 A7sus4", { lyric: "x3" }] },
      { name: "Verse", lines: ["C D G Em"] },
    ]);
    const intro = ["Em7", "G", "Dsus4", "A7sus4"];
    const verse = ["C", "D", "G", "Em"];
    const thrice = alignChords(
      parsed,
      synthFeatures(played([...intro, ...intro, ...intro, ...verse])),
      OPTS,
    );
    expect(sections(parsed, thrice)).toEqual(["Intro#0@0", "Verse#0@48"]);
    expect(timeline(parsed, thrice)).toHaveLength(16);

    const twice = alignChords(
      parsed,
      synthFeatures(played([...intro, ...intro, ...verse])),
      OPTS,
    );
    expect(sections(parsed, twice)).toEqual(["Intro#0@0", "Verse#0@32"]);
    expect(timeline(parsed, twice)).toEqual(
      [...intro, ...intro, ...verse].map((c, i) => `${c}@${i * 4}`),
    );
  });

  it("finds a transposition", () => {
    const parsed = parsedSheet([{ name: "Verse", lines: VERSE }]);
    // The sheet's C G Am F … three semitones up.
    const features = synthFeatures(
      played(["D#", "A#", "Cm", "G#", "D#", "A#", "G#", "D#"]),
    );
    const record = alignChords(parsed, features, OPTS);

    expect(record.transpose).toBe(3);
    expect(timeline(parsed, record)).toEqual(
      ["C", "G", "Am", "F", "C", "G", "F", "C"].map((c, i) => `${c}@${i * 4}`),
    );
    expect(record.score).toBeGreaterThan(0.8);
  });

  it("breaks a transposition tie with the capo", () => {
    // An augmented triad repeats every 4 semitones: Daug is Caug +2, +6 or +10,
    // indistinguishable without a bass.
    const parsed = parsedSheet([{ name: "", lines: ["Caug"] }]);
    const flatBass = (f: BeatFeatures): BeatFeatures => ({
      ...f,
      beats: f.beats.map((b) => ({ ...b, bass: b.bass.map(() => 1) })),
    });
    const features = flatBass(synthFeatures(played(["Daug"], 8), { noise: 0 }));
    for (const capo of [2, 6, 10]) {
      expect(alignChords(parsed, features, { ...OPTS, capo }).transpose).toBe(
        capo,
      );
    }
  });

  it("covers an omitted 8-bar solo with a gap, and the next section still lands", () => {
    const parsed = parsedSheet([
      { name: "Verse", lines: VERSE },
      { name: "Chorus", lines: CHORUS },
      { name: "Verse", lines: VERSE },
      { name: "Chorus", lines: CHORUS },
    ]);
    const verse = ["C", "G", "Am", "F", "C", "G", "F", "C"];
    const chorus = ["Am", "F", "C", "G", "Am", "F", "G", "G7"];
    // A solo over chords the sheet never uses.
    const solo = ["Ebm", "Bbm", "Ebm", "Bbm", "Abm", "Bbm", "Ebm", "Ebm"];
    const features = synthFeatures(
      played([...verse, ...chorus, ...solo, ...verse, ...chorus]),
    );
    const record = alignChords(parsed, features, OPTS);

    expectContiguous(record);
    const gaps = record.segments.filter((s) => s.kind === "gap");
    expect(gaps).toHaveLength(1);
    // The gap covers the solo, give or take a beat at each edge.
    expect(Math.abs(gaps[0]!.startBeat - 64)).toBeLessThanOrEqual(1);
    expect(Math.abs(gaps[0]!.endBeat - 96)).toBeLessThanOrEqual(1);
    // After the gap the performance goes on to the second verse (section 2),
    // not back to the first.
    expect(sections(parsed, record)).toEqual([
      "Verse#0@0",
      "Chorus#0@32",
      `gap@${gaps[0]!.startBeat}`,
      "Verse#0@96",
      "Chorus#0@128",
    ]);
    const after = record.segments.find(
      (s) => s.kind === "chord" && s.startBeat === 96,
    );
    expect(after?.kind === "chord" ? after.section : -1).toBe(2);
  });

  it("aligns on a double-tempo grid, each chord spanning twice the beats", () => {
    const parsed = parsedSheet([
      { name: "Verse", lines: VERSE },
      { name: "Chorus", lines: CHORUS },
    ]);
    const performed = [
      "C",
      "G",
      "Am",
      "F",
      "C",
      "G",
      "F",
      "C",
      "Am",
      "F",
      "C",
      "G",
      "Am",
      "F",
      "G",
      "G7",
    ];
    const features = synthFeatures(played(performed, 8), { beatSec: 0.25 });
    const record = alignChords(parsed, features, OPTS);

    expect(record.transpose).toBe(0);
    expect(timeline(parsed, record)).toEqual(
      performed.map((c, i) => `${c}@${i * 8}`),
    );
    expect(record.score).toBeGreaterThan(0.8);
  });

  it("scores unrelated chroma below the weak-match threshold", () => {
    const parsed = parsedSheet([
      { name: "Verse", lines: VERSE },
      { name: "Chorus", lines: CHORUS },
    ]);
    // Noise at full loudness: no chord at all.
    const noise = synthFeatures(
      played(Array.from({ length: 24 }, () => null)),
      { rms: () => 1 },
    );
    expect(alignChords(parsed, noise, OPTS).score).toBeLessThan(
      WEAK_MATCH_THRESHOLD,
    );

    // Another song's harmony: a minor-key progression sharing no chord with the sheet.
    const other = ["Ebm", "B", "Gb", "Db", "Ebm", "Abm", "B", "Bb"];
    const wrong = synthFeatures(played([...other, ...other, ...other]));
    expect(alignChords(parsed, wrong, OPTS).score).toBeLessThan(
      WEAK_MATCH_THRESHOLD,
    );
  });

  it("lets a passing slash bass the recording does not play be its root (C/B as C)", () => {
    const parsed = parsedSheet([
      { name: "Verse", lines: ["Am C", "Am C"] },
      { name: "Chorus", lines: ["C", "C/B F", "C", "G F"] },
    ]);
    // The chorus's C/B is played as plain C, its bass on C.
    const performed = ["Am", "C", "Am", "C", "C", "C", "F", "C", "G", "F"];
    const record = alignChords(parsed, synthFeatures(played(performed)), OPTS);
    expect(sections(parsed, record)).toEqual(["Verse#0@0", "Chorus#0@16"]);
    expect(timeline(parsed, record)).toContain("C/B@20");
    expect(record.score).toBeGreaterThan(WEAK_MATCH_THRESHOLD);
  });

  it("scores a fast loop on a noisy, sparse mix above the threshold", () => {
    // Shape Of You's case: one 4-chord loop, two beats a chord, under chroma
    // a free decode can follow beat by beat.
    const loop = "C#m F#m A B";
    const parsed = parsedSheet([
      { name: "Verse", lines: [loop, loop, loop, loop] },
      { name: "Chorus", lines: [loop, loop, loop, loop] },
    ]);
    const performed = Array.from(
      { length: 32 },
      (_, i) => loop.split(" ")[i % 4]!,
    );
    const features = synthFeatures(played(performed, 2), { noise: 0.9 });
    expect(alignChords(parsed, features, OPTS).score).toBeGreaterThan(
      WEAK_MATCH_THRESHOLD,
    );
  });

  it("throws on features without beats", () => {
    const parsed = parsedSheet([{ name: "", lines: ["C"] }]);
    const empty = { ...synthFeatures(["C"]), beats: [] };
    expect(() => alignChords(parsed, empty, OPTS)).toThrow(/no beats/);
  });

  it("aligns a ~650-beat recording against a ~300-token sheet in tens of ms", () => {
    const pool = ["C", "G", "Am", "F", "Dm", "Em", "E7", "Bb", "D", "A7"];
    const sheetSections = Array.from({ length: 10 }, (_, s) => ({
      name: `Part ${s}`,
      lines: Array.from({ length: 5 }, (_, l) =>
        Array.from(
          { length: 6 },
          (_, c) => pool[(s * 7 + l * 3 + c * 5) % pool.length]!,
        ).join(" "),
      ),
    }));
    const parsed = parsedSheet(sheetSections);
    const tokens = sheetSections.flatMap((s) =>
      s.lines.flatMap((l) => l.split(" ")),
    );
    expect(tokens).toHaveLength(300);
    const features = synthFeatures(
      played(tokens.slice(0, 162), 4).concat(["C", "C"]),
    );
    expect(features.beats.length).toBeGreaterThanOrEqual(650);

    alignChords(parsed, features, OPTS); // warm-up (JIT)
    const t0 = performance.now();
    alignChords(parsed, features, OPTS);
    const ms = performance.now() - t0;
    console.log(
      `alignChords: ${features.beats.length} beats × ${tokens.length} tokens in ${ms.toFixed(1)} ms`,
    );
    expect(ms).toBeLessThan(500);
  });
});
