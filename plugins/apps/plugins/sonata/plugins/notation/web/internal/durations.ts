/**
 * PURE beat-length → VexFlow notation-value decomposition.
 *
 * The `Score` measures every note's `start`/`duration` in quarter-note beats
 * (1.0 = a quarter). Standard notation can only draw a fixed vocabulary of
 * durations — whole / half / quarter / eighth / sixteenth, optionally augmented
 * by one dot. An arbitrary span (e.g. a note held for 1.25 beats) is therefore
 * not a single drawable value; it must be split into a sequence of drawable
 * pieces joined by ties (1.25 → a quarter tied to a sixteenth).
 *
 * `decomposeDuration` performs that split greedily, largest-representable-value
 * first, returning the ordered pieces. The engraver draws one VexFlow `StaveNote`
 * per piece and ties consecutive pieces of the same chord together (the converter
 * sets `tieToNext` on every piece but the last). Rests reuse the same pieces.
 *
 * Representation: each piece carries a VexFlow base `duration` token plus a `dots`
 * count, so the engraver appends `"r"` for rests and calls `Dot.buildAndAttach`
 * for the dots — one consistent representation, never a `"qd"`-style fused token.
 */

/** A single drawable notation value: a VexFlow base token plus augmentation dots. */
export interface DurationPiece {
  /** VexFlow base duration token: "w" | "h" | "q" | "8" | "16" | "32". */
  duration: string;
  /** Augmentation dots (0, 1, or 2). */
  dots: number;
  /** Length in quarter-note beats this piece occupies. */
  beats: number;
}

/**
 * The sixteenth-note grid used only as the **binary fallback** for windows the
 * adaptive detector (`rhythm.ts`) classifies binary at its coarsest densities.
 * The detector — not this constant — drives the real per-window resolution now,
 * and the table below reaches down to the 32nd; `Q` is no longer the smallest
 * drawable piece.
 */
export const Q = 0.25;

/** Floating-point comparison slack — well below the smallest table value. */
const EPS = 1e-6;

/**
 * Representable single-value lengths, largest first. Each maps a length in
 * quarter-note beats to its VexFlow base token + dot count. Dotted forms are
 * included so a 1.5-beat span decomposes to a *single* dotted-quarter piece
 * rather than two tied pieces — the notation a reader expects. The table reaches
 * down to the 32nd (dotted + plain) so sub-sixteenth spans stay drawable.
 */
const TABLE: readonly DurationPiece[] = [
  { duration: "w", dots: 0, beats: 4 },
  { duration: "h", dots: 1, beats: 3 },
  { duration: "h", dots: 0, beats: 2 },
  { duration: "q", dots: 1, beats: 1.5 },
  { duration: "q", dots: 0, beats: 1 },
  { duration: "8", dots: 1, beats: 0.75 },
  { duration: "8", dots: 0, beats: 0.5 },
  { duration: "16", dots: 1, beats: 0.375 },
  { duration: "16", dots: 0, beats: 0.25 },
  { duration: "32", dots: 1, beats: 0.1875 },
  { duration: "32", dots: 0, beats: 0.125 },
];

/**
 * Decompose a beat-length into an ordered list of drawable notation pieces.
 *
 * Greedy, largest-representable-first: repeatedly emit the largest table value
 * that fits in the remaining length. Lengths that are a single value yield one
 * piece (`1.0` → quarter, `1.5` → dotted quarter); other lengths yield several
 * the caller ties together (`1.25` → quarter + sixteenth).
 *
 * Returns `[]` for a non-positive length. The input should already be quantized
 * to the {@link Q} grid; any sub-grid remainder is dropped (it cannot be drawn).
 */
export function decomposeDuration(beats: number): DurationPiece[] {
  const pieces: DurationPiece[] = [];
  let remaining = beats;
  // Bounded: each iteration removes at least one Q from `remaining`, so the loop
  // runs at most `beats / Q` times — the guard makes a degenerate input loud-safe.
  let guard = 0;
  const GUARD_MAX = 10_000;
  while (remaining > EPS && guard++ < GUARD_MAX) {
    const piece = TABLE.find((p) => p.beats <= remaining + EPS);
    if (!piece) break; // remainder smaller than a 32nd — not drawable.
    pieces.push(piece);
    remaining -= piece.beats;
  }
  return pieces;
}
