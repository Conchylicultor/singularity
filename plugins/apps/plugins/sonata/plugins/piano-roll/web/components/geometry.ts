import {
  accidentalGlyph,
  buildTempoIndex,
  type KeyLane,
  type KeySpeller,
  type Note,
  type Projection,
  type Score,
  type TempoIndex,
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
 * AUTHORED (base-tempo) seconds of a beat. The incoming score's tempo map has
 * the playback `tempoScale` folded in (see the file header: its seconds are
 * authoredSeconds / tempoScale), so multiplying `beatToSeconds` by `tempoScale`
 * cancels the fold and recovers the tempo-INVARIANT authored timeline. This is
 * the Y axis the note geometry is authored in: a note's authored span never
 * changes when the user slows/speeds playback — only the scroll rate does
 * (pxPerSecond = PX_PER_SECOND * tempoScale). Pure.
 */
export function authoredSecondsOf(
  tempo: TempoIndex,
  tempoScale: number,
  beat: number,
): number {
  return tempo.beatToSeconds(beat) * tempoScale;
}

/**
 * One note's render-ready visual, in resolution-independent AUTHORED space:
 * X in key-fractions of the lane width (0..1, from the keyboard primitive's
 * fractional `keyLayout`), Y in authored seconds (see `authoredSecondsOf`).
 * This is the contract between the pure geometry and the canvas renderer —
 * built ONCE per (score, hidden-set, colors, tempoScale); resize and scroll
 * never touch it (the renderer maps it to pixels with a single transform).
 */
export interface NoteVisual {
  noteId: string;
  trackId: string;
  /** Left edge as a fraction of the lane width (0..1). */
  xFrac: number;
  /** Width as a fraction of the lane width (0..1). */
  wFrac: number;
  /** Onset, in authored seconds (tempo-invariant). */
  y0Sec: number;
  /** End (onset + duration), in authored seconds. Always >= y0Sec. */
  y1Sec: number;
  /**
   * The note's CSS color EXPRESSION, unresolved — track colors arrive as CSS
   * strings (typically `var(--categorical-N)`), and notes without a resolved
   * track color carry `var(--primary)`. Always a string (never null) so the
   * downstream CSS→number resolution is one uniform path with no fallback
   * branch at the consumer.
   */
  colorExpr: string;
  /**
   * The note BODY's CSS color expression — the Synthesia white-key shade for
   * naturals, its darker black-key partner for accidentals. Kept apart from
   * `colorExpr` (the undarkened base) so the renderer fills with the right
   * shade while FX still read the base.
   */
  fillExpr: string;
  /** Fill opacity. 1 = fully opaque (Synthesia draws solid notes). */
  alpha: number;
  /** Notes on black keys (sharps/flats); drives the black-key shade + FX. */
  isBlack: boolean;
  /**
   * Note-name label parts, kept apart so the accidental glyph can be rendered
   * compact + tucked against the letter. ALWAYS populated — whether labels are
   * shown (the `showNoteNames` toggle, fit thresholds) is the renderer's
   * concern, so toggling labels never rebuilds the visuals.
   */
  label: { step: string; accidental: string } | null;
}

/**
 * Build every visible note's {@link NoteVisual} — the pure, framework-free
 * replacement for the piano-roll's per-note rect memo. Hidden tracks are
 * dropped entirely; spelling prefers the note's own populated `spelling` (from
 * the key-context pass) and falls back to lazy key-aware spelling. Positions
 * are authored-space (key-fraction × authored-seconds), so the result is
 * invariant under lane resizes AND tempo changes — only score/track-view
 * changes rebuild it.
 */
export function buildNoteVisuals(input: {
  /** Score with `tempoScale` already folded into its tempo map (see header). */
  score: Score;
  /** Track ids dropped from the roll (track-mixer "hide"). */
  hiddenIds: ReadonlySet<string>;
  /** trackId → CSS color expression (track-mixer rollup). */
  colorMap: ReadonlyMap<string, string>;
  /**
   * Base color → its Synthesia black-key (sharp/flat) shade. Injected (not
   * imported) so this module stays free of the track-mixer barrel and its
   * React graph — keeping `buildNoteVisuals` pure + unit-testable.
   */
  blackKeyColor: (base: string) => string;
  /** Key-signature-aware speller for notes left unspelled by the source. */
  speller: KeySpeller;
  /** Playback tempo multiplier (1 = authored) — cancels the score's fold. */
  tempoScale: number;
}): NoteVisual[] {
  const { score, hiddenIds, colorMap, blackKeyColor, speller, tempoScale } =
    input;
  const tempo = buildTempoIndex(score);
  const keys = fractionalKeyLayout(KEYBOARD_LOW, KEYBOARD_HIGH);
  const byPitch = new Map<number, KeyLane>(keys.map((k) => [k.pitch, k]));
  // Out-of-range pitches degrade like `buildProjection`'s noteToRect: a
  // white-key-wide bar pinned to the left edge (center 0), never a crash.
  const fallbackWidth = 1 / WHITE_KEY_COUNT;

  return score.notes
    .filter((n) => !hiddenIds.has(n.track))
    .map((n) => {
      const k = byPitch.get(n.pitch);
      const w = k?.width ?? fallbackWidth;
      const center = k?.center ?? 0;
      const s = n.spelling ?? speller.spell(n.pitch);
      const base = colorMap.get(n.track) ?? "var(--primary)";
      const black = isBlackPitch(n.pitch);
      return {
        noteId: n.id,
        trackId: n.track,
        xFrac: center - w / 2,
        wFrac: w,
        y0Sec: authoredSecondsOf(tempo, tempoScale, n.start),
        y1Sec: authoredSecondsOf(tempo, tempoScale, n.start + n.duration),
        colorExpr: base,
        fillExpr: black ? blackKeyColor(base) : base,
        alpha: 1,
        isBlack: black,
        label: { step: s.step, accidental: accidentalGlyph(s.alter) },
      };
    });
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
