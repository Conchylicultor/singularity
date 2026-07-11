/**
 * Figurations: the *tone-order* half of an accompaniment pattern.
 *
 * Sonata already owns the *rhythm-grid* half — `RhythmHands = {bass,chord}`, an
 * onset necklace per hand (the *when*). A figuration is its companion: given a
 * placed chord and an onset's position, it returns the pitch(es) to strike **for
 * one hand** (the *what*). The two axes are independent (catalog §5.3): any
 * tone-order composes freely with any rhythm-grid, so "left hand = Alberti, right
 * hand = block" is just a pair of figurations over a pair of necklaces.
 *
 * Pure, framework-free leaf. Imports only `theory/core` (for `ChordData`) — all
 * pitch math is delegated to the placed tone-sets the voicing engine hands in
 * via {@link FigurationContext}; this file never calls `chordPitches` itself. Its
 * single consumer is `voicing.ts`'s groove path, so it lives co-located in
 * `voicing` rather than as a sibling leaf (one consumer ⇒ no boundary benefit to
 * a new cross-plugin edge). The registry can be promoted to a slot later without
 * changing these types (mirrors the note on the old `Voicing` registry).
 */

import type { ChordData } from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * Which hand a figuration is meant for. `"both"` figurations (arpeggios) are
 * offered to either hand's picker; `"bass"` / `"chord"` are hand-specific. The
 * role is a UI filter only ({@link figurationsForHand}) — the engine calls
 * `select` regardless.
 */
export type HandRole = "bass" | "chord" | "both";

/**
 * A placed tone-set register. `"bass"` is the low, root-position set (the left
 * hand's foundation); `"chord"` is the voice-led upper structure. A figuration's
 * degrees resolve against the ACTIVE hand's register (`ctx.tones`, following
 * whichever hand it is placed on); an `all` degree may name an EXPLICIT register
 * (`reg`) to reach across — so a bass-hand figure can strike chord-register stabs
 * (stride / oom-pah / waltz) regardless of which hand it sits on.
 */
export type Register = "bass" | "chord";

/**
 * One struck pitch within a single onset. `k` is the within-onset id index so a
 * figuration that strikes a dyad / spread (octave bass, harp roll, a chord stab)
 * gets a distinct note id per pitch. A single-pitch degree uses `k: 0`.
 */
export interface StruckTone {
  pitch: number;
  k: number;
}

/**
 * Everything a figuration needs to pick its tones for one onset. The engine
 * builds a fresh context per struck onset and hands it to `select`.
 *
 * The register model has two layers:
 *  - `tones` / `tonesOfNext` — the ACTIVE hand's placed tones (and its next-chord
 *    tones), the register a figuration follows by default. The engine sets these
 *    to the chord register on the chord hand and the bass register on the bass
 *    hand, so the SAME figuration (an arpeggio, alberti) adapts to whichever hand
 *    it is placed on.
 *  - `chordTones` / `bassTones` — BOTH placed registers, for explicit
 *    cross-register reach (a bass-hand figure striking a chord-register stab via
 *    an `{all, reg:"chord"}` degree).
 *
 * Plus the bar-position flags and next-chord lookahead the generative figures
 * (walking bass) need.
 */
export interface FigurationContext {
  /** The chord in force at this onset. */
  chord: ChordData;
  /**
   * The ACTIVE hand's placed tones (chord register on the chord hand, bass
   * register on the bass hand), ascending. Index 0 is the placed root — the
   * anchor stacked-third degrees count up from. A figuration's `tone` / `color`
   * degrees resolve against this, so it follows whichever hand it plays on.
   */
  tones: readonly number[];
  /** The active hand's placed tones for the NEXT chord, or `[]` at the end. */
  tonesOfNext: readonly number[];
  /**
   * Placed chord-register tones (voice-led upper structure), ascending — for an
   * `{all, reg:"chord"}` degree that reaches this register explicitly.
   */
  chordTones: readonly number[];
  /**
   * Placed bass-register tones (low octave, root position), ascending — for an
   * `{all, reg:"bass"}` degree that reaches this register explicitly.
   */
  bassTones: readonly number[];
  /** Running index over this hand's whole necklace (never reset per chord). */
  onsetIndex: number;
  /**
   * 0-based ordinal of this onset *within the current chord* — reset to 0 on the
   * first struck onset of every chord, so a cyclic figure restarts its degree
   * sequence on each chord's own root (catalog §1.3), instead of drifting with
   * the global onset index.
   */
  positionInChord: number;
  /** The next chord (walking-bass approach target), or `null` at the end. */
  nextChord: ChordData | null;
  /** True on the first struck onset of this chord (`positionInChord === 0`). */
  firstOnsetOfChord: boolean;
  /**
   * True when no further onset sounds within this chord — the last strike before
   * the harmony changes (or the piece ends). Where walking bass drops its
   * chromatic approach tone into the next root.
   */
  lastOnsetBeforeChange: boolean;
}

/**
 * A tone-order pattern for one hand. `select` returns the pitch(es) to strike at
 * one onset; returning `[]` is a **legitimate rest** (real silence, e.g. an
 * off-beat-only figure), *not* a failure. An unknown id, by contrast, throws in
 * {@link findFiguration} — a bug is not an absorbable empty value.
 */
export interface Figuration {
  id: string;
  label: string;
  role: HandRole;
  select: (ctx: FigurationContext) => StruckTone[];
}

// ---------------------------------------------------------------------------
// Declarative common case — degree sequences
// ---------------------------------------------------------------------------

/**
 * One slot in a cyclic degree-sequence. Three kinds:
 *  - `tone` — a stacked-third index into the home register's placed tone-set
 *    (`0`=root, `1`=3rd, `2`=5th, `3`=7th), optionally shifted `octave` octaves.
 *  - `color` — an interval in `semitones` above the placed root, optionally
 *    `octave`-shifted (the boogie 6th `+9` / ♭7 `+10`, which are not stacked
 *    thirds of a plain triad).
 *  - `all` — a slice `[from, to)` of a register's whole placed tone-set struck at
 *    once (a block chord / triad / stab / roll span). `reg` overrides the home
 *    register so a bass-hand figure can stab the chord register.
 */
export type Degree =
  | { kind: "tone"; index: number; octave?: number }
  | { kind: "color"; semitones: number; octave?: number }
  | { kind: "all"; from?: number; to?: number; reg?: Register };

/** Root (stacked-third index 0). */
export const D1: Degree = { kind: "tone", index: 0 };
/** Third (stacked-third index 1). */
export const D3: Degree = { kind: "tone", index: 1 };
/** Fifth (stacked-third index 2). */
export const D5: Degree = { kind: "tone", index: 2 };
/** Seventh (stacked-third index 3); falls back to the octave root on a triad. */
export const D7: Degree = { kind: "tone", index: 3 };
/** Octave root — the root shifted up one octave (`tone 0`, `octave 1`). */
export const D8: Degree = { kind: "tone", index: 0, octave: 1 };
/** Major-sixth color tone (`+9` semitones above the placed root — boogie). */
export const D6: Degree = { kind: "color", semitones: 9 };
/** Flat-seventh color tone (`+10` semitones above the placed root — boogie). */
export const Db7: Degree = { kind: "color", semitones: 10 };
/** The whole placed tone-set (block chord / harp span). */
export const ALL: Degree = { kind: "all" };
/** The lowest three placed tones (a triad — drops any 7th / extension). */
export const TRIAD: Degree = { kind: "all", to: 3 };

/**
 * The single owner of degree → pitch, including the **§5.4 fallback**: when a
 * requested stacked-third `tone` index does not exist on the chord (e.g. `7` on a
 * plain triad), substitute the OCTAVE ROOT (`tones[0] + 12`). The fallback lives
 * ONLY here — never special-cased per pattern — so every figuration gets it for
 * free and the rule is documented in exactly one place.
 *
 * `tone` / `color` degrees resolve against the ACTIVE hand's register
 * (`ctx.tones`), so a figuration follows whichever hand it plays on. An `all`
 * degree strikes a slice of an EXPLICIT register when `reg` is named
 * (`bassTones` / `chordTones`) and the active register otherwise — this is how a
 * bass-hand figure reaches a chord-register stab. Each struck pitch of an `all`
 * degree gets an incrementing `k`. `color` is `placedRoot + semitones (+12·octave)`.
 */
function resolveDegree(deg: Degree, ctx: FigurationContext): StruckTone[] {
  if (deg.kind === "all") {
    const tones =
      deg.reg === "bass"
        ? ctx.bassTones
        : deg.reg === "chord"
          ? ctx.chordTones
          : ctx.tones;
    const from = deg.from ?? 0;
    const to = deg.to ?? tones.length;
    return tones.slice(from, to).map((pitch, k) => ({ pitch, k }));
  }

  const tones = ctx.tones;
  if (tones.length === 0) return []; // no chord placed — a legitimate rest
  const octaveShift = 12 * (deg.octave ?? 0);

  if (deg.kind === "color") {
    return [{ pitch: tones[0]! + deg.semitones + octaveShift, k: 0 }];
  }

  // kind === "tone"
  const exists = deg.index >= 0 && deg.index < tones.length;
  // §5.4: a missing stacked-third substitutes the octave root (tones[0] + 12).
  const pitch = exists
    ? tones[deg.index]! + octaveShift
    : tones[0]! + 12 + octaveShift;
  return [{ pitch, k: 0 }];
}

/**
 * Build a figuration from a cyclic degree-sequence. It cycles on
 * `ctx.positionInChord % degrees.length` — NOT the global onset index — so every
 * chord restarts its figure on its own root (catalog §1.3). Each degree resolves
 * via {@link resolveDegree} against the active hand's register (an `all` degree
 * may reach an explicit register through its own `reg`). An empty `degrees` list
 * is inert (rest).
 */
export function cyclicFiguration(
  id: string,
  label: string,
  role: HandRole,
  degrees: readonly Degree[],
): Figuration {
  return {
    id,
    label,
    role,
    select: (ctx) => {
      if (degrees.length === 0) return [];
      const deg = degrees[ctx.positionInChord % degrees.length]!;
      return resolveDegree(deg, ctx);
    },
  };
}

// ---------------------------------------------------------------------------
// Generative escape hatch — figures that read the lookahead / bar position
// ---------------------------------------------------------------------------

/**
 * Walking bass (catalog §1.10): one bass tone per onset, built by rule rather
 * than a fixed cycle.
 *  - **First onset of the chord** → the root (`tones[0]`), the strong anchor
 *    every chord change lands on.
 *  - **Last onset before a change** (and a next chord exists) → a **chromatic
 *    approach a half-step below the next root** (`tonesOfNext[0] - 1`), so the
 *    line resolves melodically into the next bar.
 *  - **Between** → cycle 5th / 3rd / root by `positionInChord` (root & 5th are
 *    the structural pillars, 3rd next).
 *
 * Ordering note: the first-onset branch is checked *before* the approach branch,
 * so on a single-onset chord (first == last) the root wins — landing the anchor
 * on the change matters more than approaching. The approach branch is guarded by
 * `tonesOfNext.length`, so it never fires without a next chord. Resolves against
 * the active hand's register (`ctx.tones`) — as a bass-role figure that is the
 * bass register.
 */
const walking: Figuration = {
  id: "walking",
  label: "Walking bass",
  role: "bass",
  select: (ctx) => {
    if (ctx.tones.length === 0) return [];
    if (ctx.firstOnsetOfChord) return [{ pitch: ctx.tones[0]!, k: 0 }];
    if (ctx.lastOnsetBeforeChange && ctx.tonesOfNext.length > 0) {
      return [{ pitch: ctx.tonesOfNext[0]! - 1, k: 0 }];
    }
    // 5th, 3rd, root — indices 2, 1, 0.
    const cycle = [ctx.tones[2], ctx.tones[1], ctx.tones[0]];
    const pick = cycle[ctx.positionInChord % cycle.length];
    return pick === undefined ? [] : [{ pitch: pick, k: 0 }];
  },
};

/**
 * Harp roll (catalog §2.3): a single onset spreads every tone across two octaves
 * — the active hand's placed tones plus the same tones one octave up, sorted
 * ascending, each struck with its own `k`. Rhythm turns this into a rolled
 * chord; the necklace's grid decides how often the sweep recurs.
 */
const harpRoll: Figuration = {
  id: "harp-roll",
  label: "Harp roll",
  role: "chord",
  select: (ctx) => {
    const spread = [...ctx.tones, ...ctx.tones.map((p) => p + 12)].sort(
      (a, b) => a - b,
    );
    return spread.map((pitch, k) => ({ pitch, k }));
  },
};

// ---------------------------------------------------------------------------
// Registry + generic collection API
// ---------------------------------------------------------------------------

/**
 * Every figuration Sonata offers, grouped by role. Consumers touch this set only
 * through the generic API below ({@link findFiguration} / {@link figurationsForHand})
 * — never by naming an individual figuration object (collection-boundary rule),
 * so adding an entry needs zero changes anywhere else.
 */
export const FIGURATIONS: Figuration[] = [
  // Chord-register (right-hand) figures.
  cyclicFiguration("block", "Block", "chord", [ALL]),
  cyclicFiguration("block-triad", "Block triad", "chord", [TRIAD]),
  harpRoll,

  // Both-hand broken-chord figures (offered to either hand). They resolve against
  // the ACTIVE hand's register, so the same figure follows whichever hand it is
  // placed on — a missing 7th resolves to that register's octave root.
  cyclicFiguration("arpeggio-up", "Arpeggio (up)", "both", [D1, D3, D5, D7]),
  cyclicFiguration("arpeggio-down", "Arpeggio (down)", "both", [D7, D5, D3, D1]),
  cyclicFiguration("broken-updown", "Broken (up-down)", "both", [D1, D3, D5, D3]),
  cyclicFiguration("alberti", "Alberti bass", "both", [D1, D5, D3, D5]),

  // Bass-register (left-hand) figures.
  cyclicFiguration("root", "Root", "bass", [D1]),
  cyclicFiguration("octave-bass", "Octave bass", "bass", [D1, D8]),
  cyclicFiguration("root-fifth", "Root–fifth", "bass", [D1, D5]),
  cyclicFiguration("pop-1585", "Pop 1-5-8-5", "bass", [D1, D5, D8, D5]),
  cyclicFiguration("boogie", "Boogie", "bass", [D1, D3, D5, D6, Db7, D6, D5, D3]),
  // Two-register figures: the active (bass) register on the strong slot, an
  // explicit chord-register stab on the weak slot (`{all, reg:"chord"}`).
  cyclicFiguration("stride", "Stride", "bass", [
    D1,
    { kind: "all", reg: "chord" },
    D5,
    { kind: "all", reg: "chord" },
  ]),
  cyclicFiguration("waltz", "Waltz", "bass", [
    D1,
    { kind: "all", reg: "chord" },
    { kind: "all", reg: "chord" },
  ]),
  cyclicFiguration("oom-pah", "Oom-pah", "bass", [
    D1,
    { kind: "all", reg: "chord" },
    D5,
    { kind: "all", reg: "chord" },
  ]),
  walking,
];

/** Default bass-hand figuration id — a plain root, today's rhythm behaviour. */
export const DEFAULT_BASS_FIGURATION_ID = "root";
/** Default chord-hand figuration id — a full block chord, today's behaviour. */
export const DEFAULT_CHORD_FIGURATION_ID = "block";

/** Look up a figuration by id; throws loudly on an unknown id (a bug). */
export function findFiguration(id: string): Figuration {
  const f = FIGURATIONS.find((x) => x.id === id);
  if (!f) throw new Error(`[voicing] unknown figuration: ${id}`);
  return f;
}

/**
 * The figurations offered to one hand's picker: those whose role matches the hand
 * plus the `"both"` (either-hand) figures. Purely a UI filter — the engine calls
 * whatever figuration it is handed.
 */
export function figurationsForHand(hand: "bass" | "chord"): Figuration[] {
  return FIGURATIONS.filter((f) => f.role === hand || f.role === "both");
}
