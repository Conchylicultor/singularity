import type {
  Note,
  Projection,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * The piano roll's coordinate model — pure, framework-free, so the renderer and
 * the published `Projection` share ONE source of truth. Both axes are linear:
 *
 *  - X (time):  x = (beat - scrollBeat) * PX_PER_BEAT.  Beats increase rightward.
 *               `scrollBeat` is the leftmost visible beat; subtracting it lets the
 *               grid scroll horizontally while overlays anchor against the same
 *               viewport-relative origin.
 *  - Y (pitch): higher MIDI pitch sits HIGHER on screen (screen-y grows downward),
 *               so y = (PITCH_TOP - pitch) * PX_PER_SEMITONE. The vertical span is
 *               clamped to the score's pitch range (padded), so an 88-key file and
 *               a 3-note file both fill the plane sensibly.
 *
 * A note rectangle is `{ x: beatToX(start), y: pitchToY(pitch), w: duration*PX_PER_BEAT,
 * h: PX_PER_SEMITONE }`. `noteToRect` is the canonical note geometry both the
 * renderer and overlays consume.
 */

/** Horizontal pixels per quarter-note beat. */
export const PX_PER_BEAT = 80;
/** Vertical pixels per semitone (one MIDI step = one row). */
export const PX_PER_SEMITONE = 12;
/** Padding (in semitones) above/below the score's pitch range. */
const PITCH_PAD = 2;
/** Fallback pitch window when the score has no notes (one octave around C4). */
const DEFAULT_PITCH_LOW = 60;
const DEFAULT_PITCH_HIGH = 72;

export interface PitchRange {
  /** Lowest visible MIDI pitch (bottom row). */
  low: number;
  /** Highest visible MIDI pitch (top row). */
  high: number;
}

/** Derive the visible pitch window from the score's notes (padded, clamped 0–127). */
export function pitchRange(score: Score): PitchRange {
  if (score.notes.length === 0) {
    return { low: DEFAULT_PITCH_LOW, high: DEFAULT_PITCH_HIGH };
  }
  let min = Infinity;
  let max = -Infinity;
  for (const n of score.notes) {
    if (n.pitch < min) min = n.pitch;
    if (n.pitch > max) max = n.pitch;
  }
  return {
    low: Math.max(0, min - PITCH_PAD),
    high: Math.min(127, max + PITCH_PAD),
  };
}

/** Total content height in pixels for a given pitch range. */
export function planeHeight(range: PitchRange): number {
  // +1 because both endpoints are inclusive rows.
  return (range.high - range.low + 1) * PX_PER_SEMITONE;
}

/**
 * Build the `Projection` the piano roll publishes. The closures here ARE the
 * geometry the renderer draws with — overlays consuming this projection land
 * pixel-exact on the notes. `scrollBeat` is the leftmost visible beat.
 */
export function buildProjection(
  range: PitchRange,
  viewport: { width: number; height: number; scrollBeat: number },
): Projection {
  const { scrollBeat } = viewport;
  // Top row is `range.high`; y grows downward as pitch decreases.
  const top = range.high;

  const beatToX = (beat: number): number =>
    (beat - scrollBeat) * PX_PER_BEAT;
  const pitchToY = (pitch: number): number =>
    (top - pitch) * PX_PER_SEMITONE;
  const noteToRect = (note: Note) => ({
    x: beatToX(note.start),
    y: pitchToY(note.pitch),
    w: note.duration * PX_PER_BEAT,
    h: PX_PER_SEMITONE,
  });

  return {
    capabilities: new Set(["time-axis", "pitch-plane"]),
    viewport,
    beatToX,
    pitchToY,
    noteToRect,
  };
}
