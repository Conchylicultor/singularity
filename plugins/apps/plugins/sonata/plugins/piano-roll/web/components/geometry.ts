import {
  beatToSeconds,
  type KeyLane,
  type Note,
  type Projection,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

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
 *  - Y (time):  the time axis is measured in WALL-CLOCK SECONDS, not beats:
 *               y = height - (seconds(beat) - seconds(cursorBeat)) * PX_PER_SECOND.
 *               Because the transport advances the cursor at one second of
 *               wall-clock per second, the roll scrolls at a CONSTANT pixel
 *               rate regardless of tempo. Tempo instead changes how a note's
 *               beat-duration maps to seconds, so faster passages compress and
 *               slower passages elongate. The cursor maps to the lane bottom
 *               (the keyboard); future beats sit higher and descend as the
 *               transport advances. Layout is a pure function of `cursorBeat` +
 *               lane height — no per-frame React state.
 *
 * A note rectangle spans from its end (top, further in the future) to its onset
 * (bottom), and is as wide as its key. `noteToRect` is the canonical note
 * geometry both the renderer and overlays consume.
 */

/**
 * Vertical pixels per wall-clock second. Anchored so that a 120 bpm passage
 * (the default tempo, 2 beats/sec) scrolls at the same pixel rate the old
 * beat-based model used (`PX_PER_BEAT` of 90 → 180 px/sec).
 */
export const PX_PER_SECOND = 180;

/** Full 88-key piano range: A0 (21) … C8 (108). */
export const KEYBOARD_LOW = 21;
export const KEYBOARD_HIGH = 108;
/** Number of white keys in the full 88-key range. */
const WHITE_KEY_COUNT = 52;
/** Black keys are this fraction of a white key's width. */
const BLACK_WIDTH_RATIO = 0.62;
/** White pitch classes (C D E F G A B). */
const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

/** True for the five accidental pitch classes (black keys). */
export function isBlackPitch(pitch: number): boolean {
  return !WHITE_PCS.has(((pitch % 12) + 12) % 12);
}

/**
 * Build the full 88-key layout for a given pixel width. White keys tile
 * edge-to-edge (`whiteW = width / 52`); each black key centers on the boundary
 * just above its lower white neighbour, drawn narrower. Pure.
 */
export function keyLayout(width: number): KeyLane[] {
  const whiteW = width / WHITE_KEY_COUNT;
  const blackW = whiteW * BLACK_WIDTH_RATIO;

  const lanes: KeyLane[] = [];
  let whiteIndex = 0;
  for (let pitch = KEYBOARD_LOW; pitch <= KEYBOARD_HIGH; pitch++) {
    if (!isBlackPitch(pitch)) {
      lanes.push({
        pitch,
        isBlack: false,
        center: whiteIndex * whiteW + whiteW / 2,
        width: whiteW,
      });
      whiteIndex++;
    } else {
      // The boundary between the white key just below and the next one — i.e.
      // the right edge of the white key already counted (whiteIndex - 1).
      lanes.push({
        pitch,
        isBlack: true,
        center: whiteIndex * whiteW,
        width: blackW,
      });
    }
  }
  return lanes;
}

/**
 * Build the `Projection` the piano roll publishes. The closures here ARE the
 * geometry the renderer draws with — overlays and the keyboard consuming this
 * projection land pixel-exact on the notes. `cursorBeat` anchors the time axis
 * at the lane bottom.
 */
export function buildProjection(viewport: {
  width: number;
  height: number;
  cursorBeat: number;
  /** Score whose tempo map converts beats → wall-clock seconds for the Y axis. */
  score: Score;
}): Projection {
  const { width, height, cursorBeat, score } = viewport;
  const keys = keyLayout(width);
  const byPitch = new Map<number, KeyLane>(keys.map((k) => [k.pitch, k]));

  // Anchor the time axis at the cursor's wall-clock position so scroll speed is
  // a constant pixels/second; tempo only changes the beat→seconds mapping.
  const cursorSeconds = beatToSeconds(score, cursorBeat);
  const beatToY = (beat: number): number =>
    height - (beatToSeconds(score, beat) - cursorSeconds) * PX_PER_SECOND;
  const pitchToX = (pitch: number): number => byPitch.get(pitch)?.center ?? 0;
  const noteToRect = (note: Note) => {
    const k = byPitch.get(note.pitch);
    const w = k?.width ?? width / WHITE_KEY_COUNT;
    const center = k?.center ?? 0;
    const endY = beatToY(note.start + note.duration);
    return {
      x: center - w / 2,
      // Top = note end (further in the future, higher up); height spans the
      // note's wall-clock duration, so faster tempo compresses it.
      y: endY,
      w,
      h: beatToY(note.start) - endY,
    };
  };

  return {
    capabilities: new Set(["time-axis", "pitch-plane"]),
    viewport: { width, height, scrollBeat: cursorBeat },
    beatToY,
    pitchToX,
    noteToRect,
    keys,
  };
}
