import { describe, expect, it } from "bun:test";
import { beatToSeconds } from "./beat-time";
import {
  SnapshotSectionSchema,
  alignmentFromSheetSage,
} from "./snapshot-format";
import { chord } from "./test-sections";

/** A line as the snapshot builder writes it (qveoYyGGodn, trimmed to two chords). */
const LINE = {
  id: "qveoYyGGodn",
  artist: "Adam Lambert",
  song: "Whataya Want from Me",
  sectionName: "Chorus",
  artistSlug: "adam-lambert",
  songSlug: "whataya-want-from-me",
  youtube: {
    id: "X1Fqn9du7xo",
    syncStart: 0.23,
    syncEnd: 0.36,
    durationSeconds: 225.36,
  },
  chords: [chord(1, 2, { root: 4 }), chord(3, 2, { root: 5 })],
  keys: [{ beat: 1, tonic: "D", scale: "major" }],
  meters: [{ beat: 1, numBeats: 4, beatUnit: 4 }],
  tempos: [{ beat: 1, bpm: 93, swingFactor: 0, swingBeat: 0.5 }],
  endBeat: 45,
  alignment: {
    user: { beats: [0, 44], times: [51.85, 80.21] },
    refined: { beats: [0, 1, 2], times: [51.85, 52.49, 53.13] },
  },
  tags: ["AUDIO_AVAILABLE", "REFINED_ALIGNMENT"],
};

describe("snapshot line", () => {
  it("parses a line and round-trips through JSON", () => {
    const parsed = SnapshotSectionSchema.parse(
      JSON.parse(JSON.stringify(LINE)),
    );
    expect(parsed).toEqual(LINE as never);
  });

  it("drops what the index does not keep (melody, swing)", () => {
    const parsed = SnapshotSectionSchema.parse({
      ...LINE,
      notes: [{ sd: "1", octave: 0, beat: 1, duration: 1, isRest: false }],
      alignment: { ...LINE.alignment, swing: "STRAIGHT" },
    });
    expect("notes" in parsed).toBe(false);
    expect("swing" in parsed.alignment).toBe(false);
  });

  it("refuses a line missing a field, naming it", () => {
    const { endBeat: _, ...missing } = LINE;
    const result = SnapshotSectionSchema.safeParse(missing);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toEqual([
      "endBeat",
    ]);
  });
});

describe("alignmentFromSheetSage", () => {
  it("prefers the per-beat alignment and shifts it to Hookpad's 1-based beats", () => {
    const alignment = alignmentFromSheetSage(LINE.alignment);
    expect(alignment).toEqual({
      kind: "beat-times",
      beats: [1, 2, 3],
      times: [51.85, 52.49, 53.13],
    });
    if (alignment.kind !== "beat-times") throw new Error("unreachable");
    expect(beatToSeconds(alignment, 2)).toBe(52.49);
  });

  it("falls back to the start/end alignment, then to none", () => {
    expect(
      alignmentFromSheetSage({ ...LINE.alignment, refined: null }),
    ).toEqual({
      kind: "beat-times",
      beats: [1, 45],
      times: [51.85, 80.21],
    });
    expect(alignmentFromSheetSage({ user: null, refined: null })).toEqual({
      kind: "none",
    });
  });
});
