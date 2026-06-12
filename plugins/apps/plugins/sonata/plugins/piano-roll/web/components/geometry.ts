import {
  buildTempoIndex,
  type KeyLane,
  type Note,
  type Projection,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  keyLayout as fractionalKeyLayout,
  isBlackPitch,
} from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";

/**
 * The piano roll's coordinate model — pure, framework-free, so the renderer and
 * the published `Projection` share ONE source of truth. The roll is VERTICAL,
 * Synthesia-style:
 *
 *  - X (pitch): the FULL 88-key piano (A0–C8) laid across the container width.
 *               52 white keys tile edge-to-edge; the 36 black keys sit on the
 *               white/white boundaries, narrower. `keyLayout` is the single
 *               source both the falling notes and the keyboard renderer consume,
 *               so every note lands exactly on its key.
 *  - Y (time):  the time axis is anchored in AUTHORED (base-tempo) seconds and
 *               lives in CONTENT-SPACE (cursor-invariant):
 *               y = -seconds(beat) * pxPerSecond, where
 *               pxPerSecond = PX_PER_SECOND * tempoScale. The incoming `score`
 *               already has `tempoScale` folded into its tempo map
 *               (seconds = authoredSeconds / tempoScale), so multiplying by
 *               tempoScale here cancels it: a note's pixel HEIGHT is its authored
 *               duration and never changes with tempo. What tempo changes is the
 *               SCROLL SPEED — the cursor sweeps wall-clock seconds at 1×, so the
 *               roll scrolls at PX_PER_SECOND * tempoScale px/sec: slow the tempo
 *               and the whole roll scrolls slower instead of notes stretching.
 *               The per-frame scroll is NOT baked into the geometry — the display
 *               applies it as a single `translateY(offset)` on one layer, where
 *               `offset = height + seconds(cursorBeat) * pxPerSecond` maps the
 *               cursor to the lane bottom (the keyboard). Because the cursor never
 *               enters the geometry, the projection (and every note rect) is stable
 *               while playing; only the layer's transform moves. Layout is a pure
 *               function of the score + lane width + tempoScale — no per-frame
 *               React state.
 *
 * A note rectangle spans from its end (top, further in the future) to its onset
 * (bottom), and is as wide as its key. `noteToRect` is the canonical note
 * geometry both the renderer and overlays consume.
 */

/**
 * Vertical pixels per authored-tempo second (at `tempoScale` 1). Anchored so a
 * 120 bpm passage (the default tempo, 2 beats/sec) scrolls at the same pixel
 * rate the old beat-based model used (`PX_PER_BEAT` of 90 → 180 px/sec). The
 * effective scroll rate is `PX_PER_SECOND * tempoScale`, so slowing the tempo
 * slows the scroll while note heights stay fixed.
 */
export const PX_PER_SECOND = 180;

/** Full 88-key piano range: A0 (21) … C8 (108). */
export const KEYBOARD_LOW = 21;
export const KEYBOARD_HIGH = 108;
/** Number of white keys in the full 88-key range. */
const WHITE_KEY_COUNT = 52;

// The key formula lives once, in the keyboard primitive. Re-export `isBlackPitch`
// so the roll's note builder keeps importing it from here.
export { isBlackPitch };

/**
 * Build the full 88-key layout for a given pixel width. The keyboard primitive
 * owns the fractional key geometry (white keys tile edge-to-edge; black keys
 * ride the boundaries, narrower); here we scale those 0..1 fractions to pixels
 * so the falling notes and the keyboard renderer share ONE layout. Pure.
 */
export function keyLayout(width: number): KeyLane[] {
  return fractionalKeyLayout(KEYBOARD_LOW, KEYBOARD_HIGH).map((k) => ({
    ...k,
    center: k.center * width,
    width: k.width * width,
  }));
}

/**
 * Build the `Projection` the piano roll publishes. The closures here ARE the
 * geometry the renderer draws with — overlays and the keyboard consuming this
 * projection land pixel-exact on the notes. The Y axis is CONTENT-SPACE and
 * cursor-invariant; the display applies the per-frame scroll as a single
 * `translateY` (see the file header), so this projection is stable while
 * playing and recomputes only on lane-size / score change.
 */
export function buildProjection(viewport: {
  width: number;
  height: number;
  /** Score whose tempo map converts beats → wall-clock seconds for the Y axis. */
  score: Score;
  /** Playback tempo multiplier (1 = authored). Scales the scroll rate so slowing
   *  the tempo slows the scroll instead of stretching note heights. */
  tempoScale: number;
}): Projection {
  const { width, height, score, tempoScale } = viewport;
  const keys = keyLayout(width);
  const byPitch = new Map<number, KeyLane>(keys.map((k) => [k.pitch, k]));

  // Content-space Y: a note's beat maps to a fixed pixel position independent of
  // the cursor (the cursor offset is applied downstream as one translateY).
  // `score` already has `tempoScale` folded into its tempo map, so its seconds
  // are authoredSeconds / tempoScale; multiplying px/sec by tempoScale cancels
  // that, so note heights become authored-duration (tempo-independent) and the
  // cursor's constant wall-clock sweep yields a scroll rate of
  // PX_PER_SECOND * tempoScale — slower tempo, slower scroll.
  const tempo = buildTempoIndex(score);
  const pxPerSecond = PX_PER_SECOND * tempoScale;
  const beatToY = (beat: number): number =>
    -tempo.beatToSeconds(beat) * pxPerSecond;
  const pitchToX = (pitch: number): number => byPitch.get(pitch)?.center ?? 0;
  const noteToRect = (note: Note) => {
    const k = byPitch.get(note.pitch);
    const w = k?.width ?? width / WHITE_KEY_COUNT;
    const center = k?.center ?? 0;
    const endY = beatToY(note.start + note.duration);
    return {
      x: center - w / 2,
      // Top = note end (further in the future, higher up); height spans the
      // note's authored duration, so it stays fixed across tempo changes.
      y: endY,
      w,
      h: beatToY(note.start) - endY,
    };
  };

  return {
    capabilities: new Set(["time-axis", "pitch-plane"]),
    viewport: { width, height },
    beatToY,
    pitchToX,
    noteToRect,
    keys,
  };
}
