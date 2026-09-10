import { describe, expect, it } from "bun:test";
import {
  emptyScore,
  type Annotation,
  type Note,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { CHORD_BASS_TRACK, CHORD_TRACK, reVoiceChords } from "./revoice";

/**
 * `reVoiceChords` selection tests. The default pass voices AUTHORED chords only
 * (a symbol source's annotations); `include: "all"` — the chord-mode pass — also
 * voices analyzer-DERIVED chords, which a MIDI song has instead of authored ones.
 * The voicing math itself is covered by `voicing.test.ts`; here we check which
 * annotations reach it, that the original tracks survive, that a re-run replaces
 * rather than duplicates, and that voiced annotations point at the new notes.
 */

const CFG = { realistic: false, octave: 4 };

function chord(
  source: Annotation["source"],
  start: number,
  end: number,
  noteIds?: string[],
): Annotation {
  return {
    type: "chord",
    start,
    end,
    data: { symbol: "C", root: 0, quality: "maj" },
    source,
    ...(noteIds ? { target: { noteIds } } : {}),
  };
}

const midiNote = (id: string, start: number): Note => ({
  id,
  pitch: 60,
  start,
  duration: 1,
  velocity: 80,
  track: "t0",
});

function midiScore(annotations: Annotation[]): Score {
  return {
    ...emptyScore(),
    tracks: [{ id: "t0", name: "Piano" }],
    notes: [midiNote("m0", 0), midiNote("m1", 4)],
    annotations,
  };
}

const chordTrackNotes = (s: Score) =>
  s.notes.filter(
    (n) => n.track === CHORD_TRACK || n.track === CHORD_BASS_TRACK,
  );
const originalNotes = (s: Score) => s.notes.filter((n) => n.track === "t0");

describe("reVoiceChords — selection", () => {
  it("ignores derived chords by default (score returned unchanged)", () => {
    const score = midiScore([chord("derived", 0, 4, ["m0"])]);
    expect(reVoiceChords(score, CFG)).toBe(score);
  });

  it("include:'all' voices derived chords onto the chord tracks, keeping the originals", () => {
    const score = midiScore([
      chord("derived", 0, 4, ["m0"]),
      chord("derived", 4, 8, ["m1"]),
    ]);
    const out = reVoiceChords(score, CFG, null, { include: "all" });

    expect(originalNotes(out)).toEqual(originalNotes(score));
    // Two C-major block triads, one per chord, all on the chord track.
    const voiced = chordTrackNotes(out);
    expect(voiced).toHaveLength(6);
    expect(voiced.every((n) => n.track === CHORD_TRACK)).toBe(true);
    expect(out.tracks.map((t) => t.id)).toEqual([
      "t0",
      CHORD_TRACK,
      CHORD_BASS_TRACK,
    ]);
  });

  it("a second include:'all' pass replaces the chord-track notes, never duplicates them", () => {
    const score = midiScore([chord("derived", 0, 4)]);
    const once = reVoiceChords(score, CFG, null, { include: "all" });
    const twice = reVoiceChords(once, CFG, null, { include: "all" });
    expect(chordTrackNotes(twice)).toEqual(chordTrackNotes(once));
    expect(twice.notes).toHaveLength(once.notes.length);
  });

  it("re-targets every voiced annotation at the notes generated for it", () => {
    const score = midiScore([
      chord("derived", 0, 4, ["m0"]),
      chord("derived", 4, 8, ["m1"]),
    ]);
    const out = reVoiceChords(score, CFG, null, { include: "all" });
    const voicedIds = new Set(chordTrackNotes(out).map((n) => n.id));

    for (const a of out.annotations) {
      const ids = a.target?.noteIds ?? [];
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.every((id) => voicedIds.has(id))).toBe(true);
      // Each chord owns exactly the notes that start inside its span.
      const notes = chordTrackNotes(out).filter((n) => ids.includes(n.id));
      expect(notes.every((n) => n.start >= a.start && n.start < a.end)).toBe(
        true,
      );
    }
    // No annotation still points at the original MIDI notes.
    expect(out.annotations.some((a) => a.target?.noteIds?.includes("m0"))).toBe(
      false,
    );
  });

  it("the authored-only pass leaves derived annotations' targets untouched", () => {
    const derived = chord("derived", 4, 8, ["m1"]);
    const score = midiScore([chord("authored", 0, 4), derived]);
    const out = reVoiceChords(score, CFG);
    expect(out.annotations.find((a) => a.source === "derived")).toBe(derived);
    expect(chordTrackNotes(out)).toHaveLength(3);
  });
});
