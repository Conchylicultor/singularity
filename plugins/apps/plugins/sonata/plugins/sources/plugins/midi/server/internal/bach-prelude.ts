/**
 * J.S. Bach — Prelude No. 1 in C major, BWV 846 (Well-Tempered Clavier, Book I).
 *
 * The prelude is famously algorithmic: 4/4, and EVERY measure is the same
 * sixteenth-note broken-chord figuration over that bar's harmony. So the shape
 * is defined ONCE (the figuration below) and applied to a list of per-bar
 * five-note pitch sets.
 *
 * Figuration, per 4/4 bar: with the bar's five pitches p0<p1<p2<p3<p4 (p0,p1 the
 * two held lower "left-hand" voices, p2,p3,p4 the rising right-hand arpeggio),
 * the eight sixteenth-note ONSETS of each half-bar are
 *   [p0, p1, p2, p3, p4, p2, p3, p4]
 * and that group is played twice (16 sixteenths total). Bach holds p0,p1 through
 * the half-bar (left hand) while the right hand restrikes p2,p3,p4.
 *
 * The 32-measure pitch table below was transcribed from the LilyPond engraving
 * of the WTC I prelude and cross-checked so that every bar's pitch classes spell
 * its documented harmony (the chord name in each comment). Pitches are exact to
 * that source. A final tonic C-major chord (bar 33) resolves the bar-32 dominant
 * (G7) with a perfect cadence — a clean, faithful stopping point (the original's
 * freely-arpeggiated coda, bars 33-35, is intentionally omitted rather than
 * approximated).
 *
 * Left-hand voices (p0,p1) go on one track, right-hand arpeggio (p2,p3,p4) on
 * another, so the notation lens engraves a real grand staff.
 */

import type { StarterNote, StarterTrack } from "./starters";

// 32 measures as [p0, p1, p2, p3, p4] MIDI note numbers (low→high). C4 = 60.
export const BACH_PRELUDE_BARS: readonly (readonly [
  number,
  number,
  number,
  number,
  number,
])[] = [
  [60, 64, 67, 72, 76], //  1  C
  [60, 62, 69, 74, 77], //  2  Dm7/C
  [59, 62, 67, 74, 77], //  3  G7/B
  [60, 64, 67, 72, 76], //  4  C
  [60, 64, 69, 76, 81], //  5  Am/C
  [60, 62, 66, 69, 74], //  6  D7/C
  [59, 62, 67, 74, 79], //  7  G/B
  [59, 60, 64, 67, 72], //  8  Cmaj7/B
  [57, 60, 64, 67, 72], //  9  Am7
  [50, 57, 62, 66, 72], // 10  D7
  [55, 59, 62, 67, 71], // 11  G
  [55, 58, 64, 67, 73], // 12  C#dim7/G
  [53, 57, 62, 69, 74], // 13  Dm/F
  [53, 56, 62, 65, 71], // 14  Bdim7/F
  [52, 55, 60, 67, 72], // 15  C/E
  [52, 53, 57, 60, 65], // 16  Fmaj7/E
  [50, 53, 57, 60, 65], // 17  Dm7
  [43, 50, 55, 59, 65], // 18  G7
  [48, 52, 55, 60, 64], // 19  C
  [48, 55, 58, 60, 64], // 20  C7
  [41, 53, 57, 60, 64], // 21  Fmaj7
  [42, 48, 57, 60, 63], // 22  F#dim7
  [43, 51, 59, 60, 63], // 23  Cmaj7/G (chromatic ♭3 passing)
  [44, 53, 59, 60, 62], // 24  Bdim7/Ab
  [43, 53, 55, 59, 62], // 25  G7
  [43, 52, 55, 60, 64], // 26  C/G
  [43, 50, 55, 60, 65], // 27  G7sus4
  [43, 50, 55, 59, 65], // 28  G7
  [43, 51, 57, 60, 66], // 29  F#dim7/G
  [43, 52, 55, 60, 67], // 30  C/G
  [43, 50, 55, 60, 65], // 31  G7sus4
  [43, 50, 55, 59, 65], // 32  G7
];

// Final tonic (bar 33): a held C-major chord. Left = root + fifth (C3, G3),
// right = the C-major triad voiced above (E4, G4, C5, E5).
const FINAL_LH = [48, 55];
const FINAL_RH = [64, 67, 72, 76];

// Musical dynamics: a soft, even left hand under a slightly brighter right hand.
const LH_VELOCITY = 60;
const RH_VELOCITY = 72;

/**
 * Build the two piano tracks (left / right hand) for the prelude at `bpm`.
 * Notes are emitted in absolute seconds (the StarterNote contract).
 */
export function buildBachPreludeTracks(bpm: number): StarterTrack[] {
  const secPerBeat = 60 / bpm;
  const sixteenth = secPerBeat / 4;
  const barLen = 4 * secPerBeat; // 4/4

  const lh: StarterNote[] = [];
  const rh: StarterNote[] = [];

  BACH_PRELUDE_BARS.forEach(([p0, p1, p2, p3, p4], bar) => {
    const barStart = bar * barLen;
    // Two identical half-bars per measure.
    for (let half = 0; half < 2; half++) {
      const t0 = barStart + half * 2 * secPerBeat;
      // Left hand holds the two lower voices: p0 struck on the downbeat (a half
      // note), p1 one sixteenth later, both ringing to the end of the half-bar.
      lh.push({ midi: p0, time: t0, duration: 2 * secPerBeat * 0.98, velocity: LH_VELOCITY });
      lh.push({
        midi: p1,
        time: t0 + sixteenth,
        duration: (2 * secPerBeat - sixteenth) * 0.98,
        velocity: LH_VELOCITY,
      });
      // Right hand restrikes the rising arpeggio at sixteenths 2..7 of the half-bar.
      const arp = [p2, p3, p4, p2, p3, p4];
      arp.forEach((midi, k) => {
        rh.push({
          midi,
          time: t0 + (k + 2) * sixteenth,
          duration: sixteenth * 0.9,
          velocity: RH_VELOCITY,
        });
      });
    }
  });

  // Final tonic chord (whole note).
  const finalStart = BACH_PRELUDE_BARS.length * barLen;
  for (const midi of FINAL_LH) {
    lh.push({ midi, time: finalStart, duration: barLen, velocity: LH_VELOCITY });
  }
  for (const midi of FINAL_RH) {
    rh.push({ midi, time: finalStart, duration: barLen, velocity: RH_VELOCITY });
  }

  return [
    { name: "Left hand", program: 0, notes: lh },
    { name: "Right hand", program: 0, notes: rh },
  ];
}
