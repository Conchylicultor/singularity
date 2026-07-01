/**
 * Beethoven — Für Elise (Bagatelle No. 25 in A minor, WoO 59): the A-section
 * theme (the famous opening period, played as the piece's recurring refrain).
 *
 * A minor, 3/8, "Poco moto". The signature E–D#–E–D#–E–B–D–C–A motif in the
 * right hand over an arpeggiated left-hand accompaniment that alternates A minor
 * (A2 E3 A3) and E major (E2 E3 G#3). Pitches were transcribed from the Bessel
 * edition engraving and verified note-for-note; the theme restates once and ends
 * on a held tonic A.
 *
 * Authored on a sixteenth-note grid — `[midi, onset, span]` in SIXTEENTHS. A 3/8
 * bar is 6 sixteenths. A one-beat lead-in is baked into the onsets so the first
 * full bar's downbeat lands on a 3/8 barline (the two-sixteenth anacrusis then
 * sits, correctly, at the end of the pickup bar) and the notation lens bars the
 * piece cleanly.
 *
 * Two hands → grand staff. Right = melody, left = accompaniment.
 */

import type { StarterNote, StarterTrack } from "./starters";

type Ev = readonly [midi: number, onset16: number, span16: number];

// Right hand — the melody. (Comments give scientific pitch; onsets/spans in 16ths.)
const RIGHT_HAND: readonly Ev[] = [
  // pickup: E5 D#5
  [76, 4, 1], // E5
  [75, 5, 1], // D#5
  // bar 1: E5 D#5 E5 B4 D5 C5
  [76, 6, 1], // E5
  [75, 7, 1], // D#5
  [76, 8, 1], // E5
  [71, 9, 1], // B4
  [74, 10, 1], // D5
  [72, 11, 1], // C5
  // A4 | C4 E4 A4
  [69, 12, 2], // A4
  [60, 15, 1], // C4
  [64, 16, 1], // E4
  [69, 17, 1], // A4
  // B4 | E4 G#4 B4
  [71, 18, 2], // B4
  [64, 21, 1], // E4
  [68, 22, 1], // G#4
  [71, 23, 1], // B4
  // C5 | E4, then the motif restated: E5 D#5 E5 D#5 E5 B4 D5 C5
  [72, 24, 2], // C5
  [64, 27, 1], // E4
  [76, 28, 1], // E5
  [75, 29, 1], // D#5
  [76, 30, 1], // E5
  [75, 31, 1], // D#5
  [76, 32, 1], // E5
  [71, 33, 1], // B4
  [74, 34, 1], // D5
  [72, 35, 1], // C5
  // A4 | C4 E4 A4
  [69, 36, 2], // A4
  [60, 39, 1], // C4
  [64, 40, 1], // E4
  [69, 41, 1], // A4
  // B4 | E4 C5 B4
  [71, 42, 2], // B4
  [64, 45, 1], // E4
  [72, 46, 1], // C5
  [71, 47, 1], // B4
  // final tonic A4 (held a full bar)
  [69, 48, 6], // A4
];

// Left hand — arpeggiated accompaniment (bass, middle, upper), one arpeggio on
// the downbeat of each accompanied bar, alternating A minor and E major.
const LEFT_HAND: readonly Ev[] = [
  [45, 12, 1], [52, 13, 1], [57, 14, 1], // A2 E3 A3  (Am)
  [40, 18, 1], [52, 19, 1], [56, 20, 1], // E2 E3 G#3 (E)
  [45, 24, 1], [52, 25, 1], [57, 26, 1], // A2 E3 A3  (Am)
  [45, 36, 1], [52, 37, 1], [57, 38, 1], // A2 E3 A3  (Am)
  [40, 42, 1], [52, 43, 1], [56, 44, 1], // E2 E3 G#3 (E)
  [45, 48, 1], [52, 49, 1], [57, 50, 1], // A2 E3 A3  (Am)
];

const RH_VELOCITY = 76;
const LH_VELOCITY = 60;

function toNotes(evs: readonly Ev[], sixteenth: number, velocity: number): StarterNote[] {
  return evs.map(([midi, onset, span]) => ({
    midi,
    time: onset * sixteenth,
    // 0.92 gate keeps notes articulated (and repeated pitches separated).
    duration: span * sixteenth * 0.92,
    velocity,
  }));
}

/** Build the two piano tracks (right / left hand) for the theme at `bpm`. */
export function buildFurEliseTracks(bpm: number): StarterTrack[] {
  const sixteenth = 60 / bpm / 4; // seconds per sixteenth (quarter-note beat / 4)
  return [
    { name: "Right hand", program: 0, notes: toNotes(RIGHT_HAND, sixteenth, RH_VELOCITY) },
    { name: "Left hand", program: 0, notes: toNotes(LEFT_HAND, sixteenth, LH_VELOCITY) },
  ];
}
