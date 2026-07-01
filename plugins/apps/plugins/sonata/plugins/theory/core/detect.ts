/**
 * Pure "notes → chord" detection, the single home for it.
 *
 * Two layers:
 *  - `detectChordWeighted` recognises a chord from a *weighted* pitch-class
 *    profile (duration × velocity), with a bass/root bias and a best-fit score
 *    that tolerates incomplete voicings and penalises non-chord tones in
 *    proportion to how much they actually sound. `detectChord` is the historical
 *    equal-weight convenience wrapper over it.
 *  - `detectChordWindows` segments a whole `Score` on a beat-quantized grid (not
 *    raw onsets/offsets), detects the chord per window from its weighted profile,
 *    coalesces consecutive same-symbol windows, and smooths away single-cell
 *    transients flanked by identical neighbours.
 *
 * This mirrors the `inferKeys` precedent in `key-detect.ts` (windowed
 * duration-weighted histogram → continuous scoring → confidence floor → coalesce
 * → smooth), so passing-tone and arpeggio-fragmentation noise is suppressed by
 * the same proven mechanism that already stabilises key inference.
 *
 * Imports only `score/core` + the sibling chord vocabulary, keeping the DAG
 * acyclic.
 */

import {
  beatGrid,
  effectiveKeyAt,
  makeKeySpeller,
  scoreEndBeat,
  type ChordData,
  type KeySignature,
  type KeySpeller,
  type Note,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  CHORD_TEMPLATES,
  formatChordSymbol,
  formatSpelledChordSymbol,
} from "./chords";

// ---------------------------------------------------------------------------
// Tunable constants (see the robustness plan; all named for easy adjustment)
// ---------------------------------------------------------------------------

/**
 * Below this confidence a window names no chord. Confidence is the explained
 * weight fraction net of the non-chord-tone penalty (see `scoreCandidate`); an
 * atonal cluster spreads weight across many pitch-classes so every candidate
 * falls here and the window stays silent. Mirrors key-detect's atonal guard.
 */
const CONFIDENCE_FLOOR = 0.5;

/**
 * Longest window (in quarter-note beats) eligible to be smoothed away. A window
 * up to this long that is flanked by two windows of the *same* symbol is a
 * single-cell transient (a passing harmony between two statements of one chord)
 * and is absorbed into its neighbours. One quarter-beat = one default grid cell.
 */
const MIN_REGION_BEATS = 1;

/** Penalty weight for a chord tone that is absent from the window. */
const W_MISSING = 0.3;
/** Penalty weight for non-chord-tone (extra) weight — the passing-tone suppressor. */
const W_EXTRA = 0.55;
/** Bonus weight for the bass/root bias — breaks enharmonic root ties. */
const W_BASS = 0.15;

/**
 * Velocity floor for profile weighting: a note's contribution is scaled by
 * `VELOCITY_FLOOR + (1 − VELOCITY_FLOOR) × velocity/127`, so a pianissimo held
 * note still counts substantially. Set to 1.0 to disable velocity weighting.
 */
const VELOCITY_FLOOR = 0.5;

/**
 * Minimum fraction of total window weight an extension pitch-class must carry to
 * upgrade a dominant 7th to a 9th/13th — guards against a passing brush being
 * read as a colour tone.
 */
const EXT_WEIGHT_FRAC = 0.08;

// ---------------------------------------------------------------------------
// Chord vocabulary partition
// ---------------------------------------------------------------------------

/**
 * Detection scores only over base triads + 7ths. The 6th and 9/11/13 templates
 * in `CHORD_TEMPLATES` are authoring-oriented: the 6ths are enharmonic to a
 * min7/halfdim7 inversion (and would never beat it), and the extended ones use
 * literal interval sizes (9th = 14, 13th = 21) that must NOT be folded mod-12
 * into detection — extensions are recognised by `upgradeExtension` instead, so
 * the base match stays unambiguous.
 */
const BASE_TEMPLATES = CHORD_TEMPLATES.filter(
  (t) =>
    t.quality !== "maj6" &&
    t.quality !== "min6" &&
    // Suspended chords are authoring-only: a bare {0,2,7}/{0,5,7} dyad is too
    // ambiguous to name confidently, so detection never emits sus.
    t.quality !== "sus2" &&
    t.quality !== "sus4" &&
    t.intervals.every((i) => i < 12),
);

const mod12 = (n: number): number => ((n % 12) + 12) % 12;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

// ---------------------------------------------------------------------------
// Weighted detection
// ---------------------------------------------------------------------------

/** Result of chord detection, or `null` if nothing fits. */
export interface ChordMatch {
  data: ChordData;
  /** [0,1] explained weight fraction net of the non-chord-tone penalty. */
  confidence: number;
}

/** A scored (root, quality) candidate over a weighted profile. */
interface Candidate {
  root: number;
  quality: string;
  /** Ranking score (may be negative); not surfaced. */
  score: number;
  /** [0,1] presentable confidence. */
  confidence: number;
  /** The candidate's chord pitch-classes (relative to root, incl. 0). */
  relPcs: ReadonlySet<number>;
}

/**
 * Bass/root bias: strongest when the root is in the bass (root position), still
 * positive when a chord tone is in the bass (an inversion), negative when the
 * bass is a non-chord tone (this root is suspect).
 */
function bassBonus(
  root: number,
  bassPc: number | undefined,
  relPcs: ReadonlySet<number>,
): number {
  if (bassPc === undefined) return 0;
  const rel = mod12(bassPc - root);
  if (rel === 0) return 1;
  if (relPcs.has(rel)) return 0.4;
  return -0.5;
}

/** Score one (root, template) candidate against a weighted profile. */
function scoreCandidate(
  profile: ReadonlyArray<number>,
  total: number,
  root: number,
  intervals: ReadonlyArray<number>,
  bassPc: number | undefined,
): Candidate | null {
  // The root must sound (hard gate) — rejects rootless-voicing false positives.
  if (profile[root]! <= 0) return null;

  const relPcs = new Set<number>([0, ...intervals]);

  let chordWeight = 0;
  for (let pc = 0; pc < 12; pc++) {
    if (relPcs.has(mod12(pc - root))) chordWeight += profile[pc]!;
  }
  const extraWeight = total - chordWeight;

  let missing = 0;
  for (const i of relPcs) {
    if (profile[mod12(root + i)]! === 0) missing++;
  }

  const explained = chordWeight / total;
  const extraFrac = extraWeight / total;
  const completeness = (relPcs.size - missing) / relPcs.size;
  const score =
    explained -
    W_MISSING * (missing / relPcs.size) -
    W_EXTRA * extraFrac +
    W_BASS * bassBonus(root, bassPc, relPcs);
  // Confidence reflects both how cleanly the sounding weight is explained AND
  // how completely the chord is voiced — so a bare dyad that happens to be a
  // subset of a 7th reads as uncertain (≈0.5), not a falsely-confident 100%.
  const confidence = clamp01(explained - W_EXTRA * extraFrac) * completeness;

  return { root, quality: "", score, confidence, relPcs };
}

/**
 * Detect the best-fitting chord from a length-12 duration/velocity-weighted
 * pitch-class profile. Returns `null` when fewer than 2 pitch-classes sound or
 * no candidate clears the confidence floor.
 *
 * Strategy: for every root × base template, score the fit (explained weight −
 * missing-tone penalty − non-chord-tone penalty + bass bias). The non-chord-tone
 * penalty is duration-weighted, so a momentary passing tone barely dents the
 * underlying chord while a sustained foreign note correctly rejects it. The bass
 * bias breaks enharmonic root ties and surfaces inversions.
 *
 * @param profile - length-12 PC weight histogram (index = pitch-class).
 * @param bassPc - the window's bass pitch-class, for the inversion/root bias.
 */
export function detectChordWeighted(
  profile: ReadonlyArray<number>,
  bassPc?: number,
): ChordMatch | null {
  let total = 0;
  let sounding = 0;
  for (let pc = 0; pc < 12; pc++) {
    const w = profile[pc] ?? 0;
    total += w;
    if (w > 0) sounding++;
  }
  if (sounding < 2 || total <= 0) return null;

  // Templates are ordered most-specific-first; iterate so a richer chord wins
  // ties, and lower roots win remaining ties (strict-greater keeps the first).
  let best: Candidate | null = null;
  for (const tmpl of BASE_TEMPLATES) {
    for (let root = 0; root < 12; root++) {
      const cand = scoreCandidate(profile, total, root, tmpl.intervals, bassPc);
      if (!cand) continue;
      cand.quality = tmpl.quality;
      if (!best || cand.score > best.score + 1e-9) best = cand;
    }
  }

  if (!best || best.confidence < CONFIDENCE_FLOOR) return null;

  // Promote a dominant 7th to a 9th/13th when those colour tones genuinely sound.
  const quality = upgradeExtension(best, profile, total);

  // Surface an inversion: a chord tone (≠ root) in the bass becomes a slash.
  let bass: number | undefined;
  if (bassPc !== undefined) {
    const rel = mod12(bassPc - best.root);
    if (rel !== 0 && best.relPcs.has(rel)) bass = mod12(bassPc);
  }

  const data: ChordData = { symbol: "", root: best.root, quality };
  if (bass !== undefined) data.bass = bass;
  data.symbol = formatChordSymbol(data);

  return { data, confidence: best.confidence };
}

/**
 * Relabel a dominant 7th as a 9th (or 13th) when the extension pitch-class
 * carries real weight. Returns the (possibly upgraded) quality. Only `dom7` is
 * upgraded in v1 — maj9/min9/11ths are deferred. The base score is unchanged;
 * this only changes the rendered symbol suffix.
 */
function upgradeExtension(
  base: Candidate,
  profile: ReadonlyArray<number>,
  total: number,
): string {
  if (base.quality !== "dom7") return base.quality;
  const present = (semitones: number): boolean =>
    profile[mod12(base.root + semitones)]! >= EXT_WEIGHT_FRAC * total;
  const ninth = present(2); // 9th
  const thirteenth = present(9); // 13th
  if (ninth && thirteenth) return "dom13";
  if (ninth) return "dom9";
  return base.quality;
}

/**
 * Detect the best-fitting chord from a collection of MIDI pitch numbers, with
 * every distinct pitch-class weighted equally. Preserved for callers that have
 * only raw pitches; returns `null` when fewer than 2 distinct pitch-classes are
 * present. Internally delegates to `detectChordWeighted`.
 *
 * @param pitches - MIDI note numbers (any octave; duplicates are fine).
 */
export function detectChord(pitches: ReadonlyArray<number>): ChordMatch | null {
  const profile = new Array<number>(12).fill(0);
  for (const p of pitches) profile[mod12(p)] = 1;
  return detectChordWeighted(profile);
}

// ---------------------------------------------------------------------------
// Whole-score segmentation
// ---------------------------------------------------------------------------

/** A `[start, end)` beat span already covered by authored truth. */
interface Span {
  start: number;
  end: number;
}

/** A note is sounding in `[start, end)` when its span overlaps the window. */
function isSounding(n: Note, start: number, end: number): boolean {
  const noteEnd = n.start + n.duration;
  return n.start < end && noteEnd > start;
}

/** Duration × velocity weighted pitch-class profile for the sounding notes. */
function windowProfile(
  sounding: ReadonlyArray<Note>,
  start: number,
  end: number,
): number[] {
  const profile = new Array<number>(12).fill(0);
  for (const n of sounding) {
    const overlap = Math.min(n.start + n.duration, end) - Math.max(n.start, start);
    if (overlap <= 0) continue;
    const vel = VELOCITY_FLOOR + (1 - VELOCITY_FLOOR) * (n.velocity / 127);
    profile[mod12(n.pitch)]! += overlap * vel;
  }
  return profile;
}

/**
 * The window's bass pitch-class: the lowest pitch among notes that sound for at
 * least half the window (so a fleeting low blip doesn't masquerade as the bass),
 * falling back to the absolute lowest sounding note. `undefined` for an empty
 * window.
 */
function windowBassPc(
  sounding: ReadonlyArray<Note>,
  start: number,
  end: number,
): number | undefined {
  if (sounding.length === 0) return undefined;
  const half = (end - start) / 2;
  let lowSustained: number | undefined;
  let lowAny: number | undefined;
  for (const n of sounding) {
    const overlap = Math.min(n.start + n.duration, end) - Math.max(n.start, start);
    if (lowAny === undefined || n.pitch < lowAny) lowAny = n.pitch;
    if (overlap >= half && (lowSustained === undefined || n.pitch < lowSustained)) {
      lowSustained = n.pitch;
    }
  }
  const bass = lowSustained ?? lowAny;
  return bass === undefined ? undefined : mod12(bass);
}

/** A detected chord over a beat span, plus the notes realizing it. */
export interface ChordWindow {
  start: number;
  end: number;
  data: ChordData;
  confidence: number;
  /** Ids of every note sounding across the window — the realizing notes. */
  noteIds: string[];
}

/**
 * Segment `score` on a beat-quantized grid, detect the chord across each window
 * from its duration/velocity-weighted profile, coalesce consecutive windows
 * resolving to the same symbol, and smooth away single-cell transients flanked
 * by identical neighbours.
 *
 * Beat-quantization (not raw onset/offset slicing) is what kills arpeggio and
 * dense-voicing flicker: every note within a beat cell folds into one profile,
 * so a broken chord and a block chord over the same beat read identically.
 *
 * `opts.skipSpans` excludes windows overlapping authored chord regions.
 * `opts.subdivisions` refines the grid (1 = quarter-beat default; 2 = eighth).
 * `opts.slashChords` (default true) emits inversion slash symbols.
 */
export function detectChordWindows(
  score: Score,
  opts?: {
    skipSpans?: ReadonlyArray<Span>;
    subdivisions?: number;
    slashChords?: boolean;
  },
): ChordWindow[] {
  if (score.notes.length === 0) return [];

  const skipSpans = opts?.skipSpans ?? [];
  const slashChords = opts?.slashChords ?? true;
  const isSkipped = (start: number, end: number): boolean =>
    skipSpans.some((s) => start < s.end && end > s.start);

  // Key-aware spelling: build one speller per distinct in-effect key (key changes
  // are sparse), not one per window.
  const spellerByKey = new Map<string, KeySpeller>();
  const spellerFor = (key: KeySignature): KeySpeller => {
    const id = `${key.tonic}|${key.mode}`;
    let speller = spellerByKey.get(id);
    if (!speller) {
      speller = makeKeySpeller(key);
      spellerByKey.set(id, speller);
    }
    return speller;
  };

  // Grid cell boundaries: each cell's start, with the final cell closing at the
  // score's content end.
  const grid = beatGrid(score, opts?.subdivisions);
  const end = scoreEndBeat(score);

  const windows: ChordWindow[] = [];
  for (let i = 0; i < grid.length; i++) {
    const winStart = grid[i]!.startBeat;
    const winEnd = i + 1 < grid.length ? grid[i + 1]!.startBeat : end;
    if (winEnd <= winStart) continue;
    if (isSkipped(winStart, winEnd)) continue;

    const sounding = score.notes.filter((n) => isSounding(n, winStart, winEnd));
    if (sounding.length === 0) continue;

    const profile = windowProfile(sounding, winStart, winEnd);
    const bassPc = slashChords ? windowBassPc(sounding, winStart, winEnd) : undefined;
    const match = detectChordWeighted(profile, bassPc);
    if (!match) continue;

    const prev = windows[windows.length - 1];
    if (
      prev &&
      prev.data.symbol === match.data.symbol &&
      Math.abs(prev.end - winStart) < 1e-6
    ) {
      // Coalesce: extend the previous window. The first window's `spelledSymbol`
      // (the key at the span's start) stands for the whole coalesced span.
      prev.end = winEnd;
      prev.noteIds = Array.from(
        new Set([...prev.noteIds, ...sounding.map((n) => n.id)]),
      );
      prev.confidence = Math.max(prev.confidence, match.confidence);
      continue;
    }

    // Enharmonic refinement: spell the root (and any slash bass) in the window's
    // key. Only attach `spelledSymbol` when it differs from the normalized one.
    const key = effectiveKeyAt(score, winStart);
    const data: ChordData = { ...match.data };
    if (key) {
      const spelled = formatSpelledChordSymbol(match.data, spellerFor(key));
      if (spelled !== data.symbol) data.spelledSymbol = spelled;
    }

    windows.push({
      start: winStart,
      end: winEnd,
      data,
      confidence: match.confidence,
      noteIds: sounding.map((n) => n.id),
    });
  }

  return smoothTransients(windows);
}

/**
 * Drop single-cell transient windows wedged between two windows of the same
 * symbol, merging the flanking windows into one continuous span. Iterates to a
 * fixed point (mirrors the region smoothing in `inferKeys`). Conservative: never
 * merges windows whose neighbours differ — that would invent harmony.
 */
function smoothTransients(windows: ChordWindow[]): ChordWindow[] {
  let changed = true;
  while (changed && windows.length >= 3) {
    changed = false;
    for (let i = 1; i + 1 < windows.length; i++) {
      const mid = windows[i]!;
      const prev = windows[i - 1]!;
      const next = windows[i + 1]!;
      const short = mid.end - mid.start <= MIN_REGION_BEATS + 1e-9;
      const flanked =
        prev.data.symbol === next.data.symbol &&
        Math.abs(prev.end - mid.start) < 1e-6 &&
        Math.abs(mid.end - next.start) < 1e-6;
      if (!short || !flanked) continue;

      // Absorb `mid` and `next` into `prev`: one continuous same-symbol span.
      prev.end = next.end;
      prev.noteIds = Array.from(
        new Set([...prev.noteIds, ...mid.noteIds, ...next.noteIds]),
      );
      prev.confidence = Math.max(prev.confidence, next.confidence);
      windows.splice(i, 2);
      changed = true;
      break;
    }
  }
  return windows;
}
