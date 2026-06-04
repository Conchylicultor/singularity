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
 *  - Y (time):  the time axis is anchored in AUTHORED (base-tempo) seconds:
 *               y = height - (seconds(beat) - seconds(cursorBeat)) * pxPerSecond,
 *               where pxPerSecond = PX_PER_SECOND * tempoScale. The incoming
 *               `score` already has `tempoScale` folded into its tempo map
 *               (seconds = authoredSeconds / tempoScale), so multiplying by
 *               tempoScale here cancels it: a note's pixel HEIGHT is its
 *               authored duration and never changes with tempo. What tempo
 *               changes is the SCROLL SPEED — the cursor sweeps wall-clock
 *               seconds at 1×, so the roll scrolls at PX_PER_SECOND * tempoScale
 *               px/sec: slow the tempo and the whole roll scrolls slower instead
 *               of notes stretching. The cursor maps to the lane bottom (the
 *               keyboard); future beats sit higher and descend as the transport
 *               advances. Layout is a pure function of `cursorBeat` + `tempoScale`
 *               + lane height — no per-frame React state.
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
  /** Playback tempo multiplier (1 = authored). Scales the scroll rate so slowing
   *  the tempo slows the scroll instead of stretching note heights. */
  tempoScale: number;
}): Projection {
  const { width, height, cursorBeat, score, tempoScale } = viewport;
  const keys = keyLayout(width);
  const byPitch = new Map<number, KeyLane>(keys.map((k) => [k.pitch, k]));

  // `score` already has `tempoScale` folded into its tempo map, so its seconds
  // are authoredSeconds / tempoScale. Multiplying px/sec by tempoScale cancels
  // that: note heights become authored-duration (tempo-independent) and the
  // cursor's constant wall-clock sweep yields a scroll rate of
  // PX_PER_SECOND * tempoScale — slower tempo, slower scroll.
  const pxPerSecond = PX_PER_SECOND * tempoScale;
  const cursorSeconds = beatToSeconds(score, cursorBeat);
  const beatToY = (beat: number): number =>
    height - (beatToSeconds(score, beat) - cursorSeconds) * pxPerSecond;
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
    viewport: { width, height, scrollBeat: cursorBeat },
    beatToY,
    pitchToX,
    noteToRect,
    keys,
  };
}
