/**
 * PURE vertical extent of engraved staves — how far above and below its five
 * lines a staff's ink reaches (ledger-line notes, stems, tuplet numbers, chord
 * symbols). The engraver sizes each system's box and the gaps between its
 * staves from these, so a high right-hand run or a low left-hand octave is never
 * clipped by the SVG edge nor drawn into the neighbouring staff.
 *
 * Coordinates are STAVE-LOCAL px, VexFlow's convention: a `Stave` created at
 * `y` draws its top line at `y + 40` (4 spaces of headroom) and its bottom line
 * at `y + 80`; a note on VexFlow line `L` (1 = bottom line … 5 = top line) sits
 * at `90 - 10·L`. Read straight from the model's keys, never from a drawn SVG,
 * so the whole layout stays computable before anything mounts.
 */
import type { EngMeasure, EngStaff, EngVoice } from "./convert";

/** A staff's ink bounds in stave-local px (`top` may be negative). */
export interface StaffExtent {
  top: number;
  bottom: number;
}

/** VexFlow `Tables.STAVE_LINE_DISTANCE`. */
const SPACE = 10;
/** VexFlow `Tables.STEM_HEIGHT`. */
const STEM = 35;
/** Stave-local y of the top / bottom staff line (4 spaces of headroom). */
const TOP_LINE_Y = 40;
const BOTTOM_LINE_Y = 80;
/** Half a notehead, plus room for an accidental glyph standing above it. */
const HEAD_REACH = 8;
/** A beamed stem may run a little past its plain length to meet the beam. */
const BEAM_SLACK = 6;
/** Tuplet bracket + number, above whatever it clears. */
const TUPLET_REACH = 22;
/** Chord-symbol text above the staff or the note it annotates. */
const CHORD_REACH = 26;
/** The clef glyphs' reach past the outer staff lines. */
const CLEF_REACH = 14;

/** An empty staff's extent: its lines plus the clef glyph. */
const BASE: StaffExtent = {
  top: TOP_LINE_Y - CLEF_REACH,
  bottom: BOTTOM_LINE_Y + CLEF_REACH,
};

const STEP_INDEX: Record<string, number> = {
  c: 0,
  d: 1,
  e: 2,
  f: 3,
  g: 4,
  a: 5,
  b: 6,
};

/** Diatonic index of the staff's middle line (VexFlow line 3): B4 / D3. */
const MIDDLE_LINE_INDEX: Record<EngStaff["clef"], number> = {
  treble: 4 * 7 + STEP_INDEX.b!,
  bass: 3 * 7 + STEP_INDEX.d!,
};

/**
 * VexFlow line of a key like `"c#/4"` on a clef (3 = middle line, half-steps
 * between lines). Accidentals don't move a note's line, so only the letter and
 * the octave count.
 */
export function keyLine(key: string, clef: EngStaff["clef"]): number {
  const [name, octave] = key.split("/");
  const step = STEP_INDEX[name![0]!.toLowerCase()];
  if (step === undefined || octave === undefined) {
    throw new Error(`Unparseable VexFlow key "${key}"`);
  }
  return 3 + (Number(octave) * 7 + step - MIDDLE_LINE_INDEX[clef]) / 2;
}

const yOfLine = (line: number): number => 90 - SPACE * line;

/** Grow `a` to also cover `b`. */
export function unionExtent(a: StaffExtent, b: StaffExtent): StaffExtent {
  return { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
}

/** One voice's ink on a staff: noteheads, stems and tuplet brackets. */
function voiceExtent(voice: EngVoice, clef: EngStaff["clef"]): StaffExtent {
  let ext = BASE;
  let hasTuplet = false;
  for (const t of voice.tickables) {
    if (t.isRest) continue;
    if (t.tuplet) hasTuplet = true;
    const lines = t.keys.map((k) => keyLine(k, clef));
    const hi = Math.max(...lines);
    const lo = Math.min(...lines);
    // VexFlow's own auto-stem rule: up when the chord sits below the middle line.
    const stemUp =
      voice.stem === "up" || (voice.stem === "auto" && (hi + lo) / 2 < 3);
    const headTop = yOfLine(hi) - HEAD_REACH;
    const headBottom = yOfLine(lo) + HEAD_REACH;
    ext = unionExtent(ext, {
      top: stemUp
        ? Math.min(headTop, yOfLine(hi) - STEM - BEAM_SLACK)
        : headTop,
      bottom: stemUp
        ? headBottom
        : Math.max(headBottom, yOfLine(lo) + STEM + BEAM_SLACK),
    });
    for (const g of t.graceNotes ?? []) {
      const gl = g.keys.map((k) => keyLine(k, clef));
      ext = unionExtent(ext, {
        top: yOfLine(Math.max(...gl)) - STEM,
        bottom: yOfLine(Math.min(...gl)) + HEAD_REACH,
      });
    }
  }
  // VexFlow always places the bracket on top, clearing the staff and the notes.
  if (hasTuplet) {
    ext = { ...ext, top: Math.min(ext.top, TOP_LINE_Y) - TUPLET_REACH };
  }
  return ext;
}

/**
 * Per-staff extent of one measure, parallel to `measure.staves`. The chord
 * symbol rides above the top staff, clearing both its lines and its notes.
 */
export function measureStaffExtents(measure: EngMeasure): StaffExtent[] {
  return measure.staves.map((staff, si) => {
    let ext = BASE;
    for (const v of staff.voices) {
      ext = unionExtent(ext, voiceExtent(v, staff.clef));
    }
    if (si === 0 && measure.chordSymbol) {
      ext = { ...ext, top: Math.min(ext.top, TOP_LINE_Y) - CHORD_REACH };
    }
    return ext;
  });
}
