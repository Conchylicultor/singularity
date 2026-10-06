/**
 * The aligner: a sheet's fixed chord sequence onto a recording's beats.
 *
 * A left-to-right HMM with jumps ("jump alignment", McVicar et al. 2011),
 * decoded with Viterbi in log space, once per transposition:
 *
 * - **States**: one per sheet chord token (blocks laid end to end, see
 *   `sheet.ts`), plus **fillers** for what the sheet does not cover: one
 *   intro, and one gap after each block.
 * - **Transitions**: stay on a token; advance to the next token in the block;
 *   at a block's last token go to the next block (cheap), repeat the block
 *   (cheaper with an "x2" hint), jump to a block of the expected name
 *   (medium), to any block (expensive) or into the filler after it
 *   (expensive). A line marked "x4" is unrolled into four copies (`sheet.ts`);
 *   the end of a copy may skip the remaining ones. A filler stays, or enters
 *   any block, priced like the jump from the block it follows. Every change
 *   pays a small penalty off the downbeat (less on the half bar), so chords
 *   change where music does. The minimum duration is one beat, so a half- or
 *   double-tempo grid needs nothing special.
 * - **Emission**: the correlation of the beat's chroma with the chord's
 *   template rotated by the transposition, plus a bass term (the bass chroma
 *   at the chord's bass). The filler emits a constant floor, raised when the
 *   beat is quiet, so silence, intros and omitted passages fall into it.
 * - **Transposition**: all 12 are decoded; the best total wins, with a small
 *   prior for `transpose ≡ capo` (UG chords are shapes over the capo).
 * - **Score** = fit × coverage. `fit` is how much of the gain over explaining
 *   nothing (all filler) the sheet-constrained path achieves, relative to a
 *   free decode where any chord may follow any other: it cancels how clean a
 *   recording's chroma is, which an absolute correlation does not. `coverage`
 *   is the fraction of the sheet's written chords the path plays: a wrong
 *   recording sharing one progression with the sheet (I–V–vi–IV) fits that
 *   block well, but only by repeating it and skipping the rest.
 * - **Per-bar confidence**: the margin of the path chord's correlation over
 *   the best other triad, squashed to 0–1; filler beats count 0.
 *
 * Cost is O(beats × (tokens + blocks × (blocks + exits))) per transposition:
 * tens of ms for a song.
 */

import type { BeatFeatures } from "@plugins/infra/plugins/audio-analysis/core";
import type { ParsedTab } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import {
  ALIGNER_VERSION,
  type AlignmentRecord,
  type AlignmentSegment,
} from "./record";
import { buildAlignSheet, type AlignSheet } from "./sheet";
import {
  TRIAD_VOCABULARY,
  dot12,
  pcMask,
  prepareBeat,
  toneTemplate,
  type PreparedBeat,
} from "./templates";

// ---------------------------------------------------------------------------
// Tunable constants (log-space, in units of chroma correlation per beat).
// Calibrated on the reference songs — see the plan doc.
// ---------------------------------------------------------------------------

/** Weight of the bass term against the treble correlation. */
const BASS_WEIGHT = 0.5;
/** The filler's emission on a normally loud beat. */
const FILLER_FLOOR = 0.3;
/** How much higher the filler's emission is on a silent beat. */
const FILLER_QUIET_BOOST = 0.6;
/** Below this relative rms a beat counts as (partly) quiet. */
const QUIET_RMS = 0.15;

/** Moving to the next token. */
const ADVANCE = 0;
/** Extra cost of a change on the half bar / anywhere else off the downbeat. */
const HALF_BAR = -0.05;
const OFF_BEAT = -0.15;

/** From a block's last token: the next block in sheet order. */
const NEXT_BLOCK = -0.1;
/** Repeat the block just played; with an "x2" hint. */
const REPEAT_BLOCK = -2.5;
const REPEAT_BLOCK_HINTED = -1;
/** Skipping the remaining copies of a line marked to repeat. */
const SKIP_REPEAT = -1;
/** A block named like the expected next one (or the one just played), elsewhere in the sheet. */
const SAME_NAME = -1.5;
/** Any other block. */
const ANY_BLOCK = -4;
/** A block's end into the gap after it, and a filler into a block (on top of the jump it stands for). */
const FILLER_ENTER = -3;
const FILLER_EXIT = -1;
/** Starting anywhere but the first block or the filler. */
const START_ELSEWHERE = -3;

/** Total log-score bonus of `transpose ≡ capo`. */
const CAPO_PRIOR = 2;

/** Margin (correlation) that squashes to a bar confidence of ≈0.73. */
const MARGIN_SCALE = 0.1;

const NEG = -Infinity;

/**
 * The flat state space the decoder runs over: the token states (blocks laid
 * end to end), then `B + 1` filler states. Filler 0 is the intro (before any
 * block); filler `1 + i` is a gap after block `i`, so leaving it remembers
 * where the performance was: a gap after the first chorus goes on to the
 * second verse, not back to the first.
 */
interface StateSpace {
  sheet: AlignSheet;
  /** Number of token states; filler `f` is state `size + f`. */
  size: number;
  blockStart: number[];
  /**
   * The states a block may be left from: its last token (cost 0) and the end
   * of every copy of a repeated last line but the last (cost `SKIP_REPEAT`).
   */
  exitState: Int32Array;
  exitBlock: Int32Array;
  exitCost: Float64Array;
  /** Per token state: its block. */
  blockOf: Int32Array;
  /** Per token state: its shape, or -1 for an unreadable symbol. */
  shapeOf: Int32Array;
  /** `jump[i * B + j]`: from block i's end to block j's start. */
  jump: Float64Array;
  /** `exit[f * B + j]`: from filler f into block j's start. */
  exit: Float64Array;
  /** Skips past the unrolled copies of a repeated line, within a block, as absolute states. */
  skips: { from: number; to: number }[];
}

function buildStateSpace(sheet: AlignSheet): StateSpace {
  const B = sheet.blocks.length;
  const blockStart: number[] = [];
  const blockOfList: number[] = [];
  const shapeOfList: number[] = [];
  const exits: { state: number; block: number; cost: number }[] = [];
  const skips: { from: number; to: number }[] = [];
  sheet.blocks.forEach((block, b) => {
    const start = blockOfList.length;
    blockStart.push(start);
    for (const token of block.tokens) {
      blockOfList.push(b);
      shapeOfList.push(token.shape ?? -1);
    }
    exits.push({ state: blockOfList.length - 1, block: b, cost: 0 });
    for (const skip of block.skips) {
      if (skip.to === block.tokens.length)
        exits.push({ state: start + skip.from, block: b, cost: SKIP_REPEAT });
      else skips.push({ from: start + skip.from, to: start + skip.to });
    }
  });

  const jump = new Float64Array(B * B);
  for (let i = 0; i < B; i++) {
    const here = sheet.blocks[i]!;
    const expected = i + 1 < B ? sheet.blocks[i + 1]!.name : null;
    for (let j = 0; j < B; j++) {
      const there = sheet.blocks[j]!;
      let cost: number;
      if (j === i + 1) cost = NEXT_BLOCK;
      else if (j === i)
        cost = here.repeatHint ? REPEAT_BLOCK_HINTED : REPEAT_BLOCK;
      else if (
        there.name.length > 0 &&
        (there.name === expected || there.name === here.name)
      )
        cost = SAME_NAME;
      else cost = ANY_BLOCK;
      jump[i * B + j] = cost;
    }
  }

  // Leaving a gap costs FILLER_EXIT plus the jump it stands in for.
  const exit = new Float64Array((B + 1) * B);
  for (let j = 0; j < B; j++)
    exit[j] = FILLER_EXIT + (j === 0 ? 0 : START_ELSEWHERE);
  for (let i = 0; i < B; i++) {
    for (let j = 0; j < B; j++)
      exit[(i + 1) * B + j] = FILLER_EXIT + jump[i * B + j]!;
  }

  return {
    sheet,
    size: blockOfList.length,
    blockStart,
    exitState: Int32Array.from(exits, (e) => e.state),
    exitBlock: Int32Array.from(exits, (e) => e.block),
    exitCost: Float64Array.from(exits, (e) => e.cost),
    blockOf: Int32Array.from(blockOfList),
    shapeOf: Int32Array.from(shapeOfList),
    jump,
    exit,
    skips,
  };
}

/** Bars of the beat grid: bar `k` spans beats `[barStart[k], barStart[k+1])`. */
function barStarts(features: BeatFeatures): number[] {
  const starts = [0];
  features.beats.forEach((beat, i) => {
    if (beat.downbeat && i > 0) starts.push(i);
  });
  return starts;
}

/** Per beat: the log-cost of a chord change landing on it. */
function changePrior(features: BeatFeatures, starts: number[]): Float64Array {
  const n = features.beats.length;
  const prior = new Float64Array(n).fill(OFF_BEAT);
  for (let k = 0; k < starts.length; k++) {
    const start = starts[k]!;
    const end = k + 1 < starts.length ? starts[k + 1]! : n;
    const len = end - start;
    // A pickup bar (no downbeat at its start) is measured back from its end.
    const isPickup = !features.beats[start]!.downbeat;
    if (!isPickup) prior[start] = 0;
    const fullLen =
      isPickup && k + 1 < starts.length ? nextBarLen(starts, k + 1, n) : len;
    if (fullLen % 2 === 0) {
      const half = isPickup ? end - fullLen / 2 : start + fullLen / 2;
      if (half >= start && half < end) prior[half] = HALF_BAR;
    }
  }
  return prior;
}

function nextBarLen(starts: number[], k: number, n: number): number {
  return (k + 1 < starts.length ? starts[k + 1]! : n) - starts[k]!;
}

/**
 * Per transposition, per beat, per shape: the emission (correlation + bass
 * term) and the bare correlation, laid out `[(tr * T + t) * K + k]`.
 */
function emissions(
  sheet: AlignSheet,
  beats: PreparedBeat[],
): { emit: Float64Array; corr: Float64Array } {
  const T = beats.length;
  const K = sheet.shapes.length;
  const templates = sheet.shapes.map((shape) =>
    Array.from({ length: 12 }, (_, root) => toneTemplate(shape.tones, root)),
  );
  const emit = new Float64Array(12 * T * K);
  const corr = new Float64Array(12 * T * K);
  for (let tr = 0; tr < 12; tr++) {
    for (let t = 0; t < T; t++) {
      const beat = beats[t]!;
      for (let k = 0; k < K; k++) {
        const shape = sheet.shapes[k]!;
        const root = (shape.root + tr) % 12;
        const c = dot12(beat.chroma, templates[k]![root]!);
        const at = (tr * T + t) * K + k;
        corr[at] = c;
        emit[at] = c + BASS_WEIGHT * beat.bass[(root + shape.bass) % 12]!;
      }
    }
  }
  return { emit, corr };
}

function fillerEmission(beat: PreparedBeat): number {
  return (
    FILLER_FLOOR + FILLER_QUIET_BOOST * Math.max(0, 1 - beat.rms / QUIET_RMS)
  );
}

/**
 * Viterbi over one transposition. Returns the best final log-score and, when
 * asked, the decoded state per beat.
 */
function decode(
  space: StateSpace,
  tr: number,
  emit: Float64Array,
  filler: Float64Array,
  change: Float64Array,
  withPath: boolean,
): { logp: number; path: Int32Array | null } {
  const T = filler.length;
  const S = space.size;
  const B = space.blockStart.length;
  const N = S + B + 1;
  const K = space.sheet.shapes.length;
  const {
    blockStart,
    exitState,
    exitBlock,
    exitCost,
    blockOf,
    shapeOf,
    jump,
    exit,
    skips,
  } = space;
  const E = exitState.length;

  let prev = new Float64Array(N);
  let next = new Float64Array(N);
  const back = withPath ? new Int32Array(T * N) : null;

  const addEmission = (row: Float64Array, t: number): void => {
    const base = (tr * T + t) * K;
    const f = filler[t]!;
    for (let s = 0; s < S; s++) {
      const k = shapeOf[s]!;
      row[s]! += k < 0 ? f : emit[base + k]!;
    }
    for (let s = S; s < N; s++) row[s]! += f;
  };

  // t = 0: the first block or the intro filler, or (expensively) any other block.
  prev.fill(NEG);
  for (let b = 0; b < B; b++)
    prev[blockStart[b]!] = b === 0 ? 0 : START_ELSEWHERE;
  prev[S] = 0;
  addEmission(prev, 0);
  if (back) back.fill(-1, 0, N);

  for (let t = 1; t < T; t++) {
    const ch = change[t]!;
    const row = t * N;
    // Stay, or advance within the block.
    for (let s = 0; s < S; s++) {
      let best = prev[s]!;
      let arg = s;
      if (s > 0 && blockOf[s - 1] === blockOf[s]) {
        const cand = prev[s - 1]! + ADVANCE + ch;
        if (cand > best) {
          best = cand;
          arg = s - 1;
        }
      }
      next[s] = best;
      if (back) back[row + s] = arg;
    }
    for (const skip of skips) {
      const cand = prev[skip.from]! + SKIP_REPEAT + ch;
      if (cand > next[skip.to]!) {
        next[skip.to] = cand;
        if (back) back[row + skip.to] = skip.from;
      }
    }
    // Block starts: from any block's exit, or out of any filler.
    for (let j = 0; j < B; j++) {
      const s = blockStart[j]!;
      let best = next[s]!;
      let arg = back ? back[row + s]! : 0;
      for (let e = 0; e < E; e++) {
        const from = exitState[e]!;
        const cand =
          prev[from]! + exitCost[e]! + jump[exitBlock[e]! * B + j]! + ch;
        if (cand > best) {
          best = cand;
          arg = from;
        }
      }
      for (let f = 0; f <= B; f++) {
        const cand = prev[S + f]! + exit[f * B + j]! + ch;
        if (cand > best) {
          best = cand;
          arg = S + f;
        }
      }
      next[s] = best;
      if (back) back[row + s] = arg;
    }
    // Fillers: stay; the gap after block i is entered from its exits.
    for (let f = S; f < N; f++) {
      next[f] = prev[f]!;
      if (back) back[row + f] = f;
    }
    for (let e = 0; e < E; e++) {
      const f = S + 1 + exitBlock[e]!;
      const cand = prev[exitState[e]!]! + exitCost[e]! + FILLER_ENTER + ch;
      if (cand > next[f]!) {
        next[f] = cand;
        if (back) back[row + f] = exitState[e]!;
      }
    }
    addEmission(next, t);
    [prev, next] = [next, prev];
  }

  let logp = NEG;
  let last = S;
  for (let s = 0; s < N; s++) {
    if (prev[s]! > logp) {
      logp = prev[s]!;
      last = s;
    }
  }
  if (!back) return { logp, path: null };
  const path = new Int32Array(T);
  path[T - 1] = last;
  for (let t = T - 1; t > 0; t--) path[t - 1] = back[t * N + path[t]!]!;
  return { logp, path };
}

/** Turn a decoded state path into the record's performance-order segments. */
function toSegments(space: StateSpace, path: Int32Array): AlignmentSegment[] {
  const isFiller = (s: number): boolean => s >= space.size;
  const segments: AlignmentSegment[] = [];
  const occurrences = new Map<number, number>();
  let occurrence = 0;
  let start = 0;

  const close = (end: number): void => {
    const s = path[start]!;
    if (isFiller(s)) {
      segments.push({ kind: "gap", startBeat: start, endBeat: end });
      return;
    }
    const block = space.sheet.blocks[space.blockOf[s]!]!;
    const token = block.tokens[s - space.blockStart[space.blockOf[s]!]!]!;
    segments.push({
      kind: "chord",
      section: token.section,
      line: token.line,
      chord: token.chord,
      occurrence,
      startBeat: start,
      endBeat: end,
    });
  };

  const enter = (t: number): void => {
    const s = path[t]!;
    if (isFiller(s)) return;
    const b = space.blockOf[s]!;
    if (s !== space.blockStart[b]) return;
    const section = space.sheet.blocks[b]!.section;
    occurrence = occurrences.get(section) ?? 0;
    occurrences.set(section, occurrence + 1);
  };

  enter(0);
  for (let t = 1; t < path.length; t++) {
    const same =
      path[t] === path[t - 1] || (isFiller(path[t]!) && isFiller(path[t - 1]!));
    if (same) continue;
    close(t);
    start = t;
    enter(t);
  }
  close(path.length);
  return segments;
}

/** The squashed confidence margin of the path chord at one beat (0 for the filler). */
function beatConfidence(
  space: StateSpace,
  beat: PreparedBeat,
  state: number,
  tr: number,
  pathCorr: number,
): number {
  if (state >= space.size) return 0;
  const k = space.shapeOf[state]!;
  if (k < 0) return 0;
  const shape = space.sheet.shapes[k]!;
  const mask = pcMask(shape.tones, shape.root + tr);
  let rival = NEG;
  for (const v of TRIAD_VOCABULARY) {
    if (v.pcs === mask) continue;
    const c = dot12(beat.chroma, v.template);
    if (c > rival) rival = c;
  }
  return 1 / (1 + Math.exp(-(pathCorr - rival) / MARGIN_SCALE));
}

/**
 * The reference decode: the same emissions and change prior, but any chord of
 * the vocabulary (the 24 triads plus the sheet's own shapes at `tr`) may follow
 * any other. The sheet-constrained path can only do worse; how much worse is
 * what tells a right recording from a wrong one with the same harmony.
 */
function freeDecode(
  sheet: AlignSheet,
  beats: PreparedBeat[],
  tr: number,
  filler: Float64Array,
  change: Float64Array,
): number {
  const T = beats.length;
  const vocab: { template: Float64Array; bass: number }[] = [];
  for (const tones of [
    [0, 4, 7],
    [0, 3, 7],
  ]) {
    for (let root = 0; root < 12; root++)
      vocab.push({ template: toneTemplate(tones, root), bass: root });
  }
  for (const shape of sheet.shapes) {
    const root = (shape.root + tr) % 12;
    vocab.push({
      template: toneTemplate(shape.tones, root),
      bass: (root + shape.bass) % 12,
    });
  }
  const V = vocab.length;
  let prev = new Float64Array(V + 1);
  let next = new Float64Array(V + 1);
  const emission = (t: number, v: number): number => {
    if (v === V) return filler[t]!;
    const beat = beats[t]!;
    return (
      dot12(beat.chroma, vocab[v]!.template) +
      BASS_WEIGHT * beat.bass[vocab[v]!.bass]!
    );
  };
  for (let v = 0; v <= V; v++) prev[v] = emission(0, v);
  for (let t = 1; t < T; t++) {
    let top = NEG;
    for (let v = 0; v <= V; v++) if (prev[v]! > top) top = prev[v]!;
    const switched = top + ADVANCE + change[t]!;
    for (let v = 0; v <= V; v++)
      next[v] = Math.max(prev[v]!, switched) + emission(t, v);
    [prev, next] = [next, prev];
  }
  let best = NEG;
  for (let v = 0; v <= V; v++) if (prev[v]! > best) best = prev[v]!;
  return best;
}

/** What the calibration script reads besides the record. */
export interface AlignDiagnostics {
  /** Best sheet-constrained log-score per beat, at the chosen transposition (no capo prior). */
  constrained: number;
  /** Best free (any chord after any chord) log-score per beat, same transposition. */
  free: number;
  /** The all-filler log-score per beat: what explaining nothing earns. */
  base: number;
  /** How much of the free decode's gain over `base` the sheet achieves, 0–1. */
  fit: number;
  /** Fraction of the sheet's written chord tokens the path visits, 0–1. */
  coverage: number;
}

/** Fraction of the sheet's written chords (a token inherited by an empty header counts once) the performance plays. */
function sheetCoverage(
  sheet: AlignSheet,
  segments: AlignmentSegment[],
): number {
  const key = (t: { section: number; line: number; chord: number }): string =>
    `${t.section}/${t.line}/${t.chord}`;
  const written = new Set<string>();
  for (const block of sheet.blocks)
    for (const token of block.tokens) written.add(key(token));
  const played = new Set<string>();
  for (const seg of segments) if (seg.kind === "chord") played.add(key(seg));
  return played.size / written.size;
}

/**
 * Align a parsed sheet to a recording's beat features. Pure and synchronous.
 * Throws when the features have no beats or the sheet has no chords.
 */
export function alignChords(
  parsed: ParsedTab,
  features: BeatFeatures,
  opts: { capo: number; sheetHash: string; settingsKey: string },
): AlignmentRecord {
  return alignWithDiagnostics(parsed, features, opts).record;
}

export function alignWithDiagnostics(
  parsed: ParsedTab,
  features: BeatFeatures,
  opts: { capo: number; sheetHash: string; settingsKey: string },
): { record: AlignmentRecord; diagnostics: AlignDiagnostics } {
  const T = features.beats.length;
  if (T === 0)
    throw new Error(
      `Cannot align: the features of ${features.videoId} have no beats.`,
    );
  const sheet = buildAlignSheet(parsed);
  const space = buildStateSpace(sheet);
  const beats = features.beats.map(prepareBeat);
  const { emit, corr } = emissions(sheet, beats);
  const filler = Float64Array.from(beats, fillerEmission);
  const starts = barStarts(features);
  const change = changePrior(features, starts);
  const capo = ((opts.capo % 12) + 12) % 12;

  let bestTr = 0;
  let bestTotal = NEG;
  for (let tr = 0; tr < 12; tr++) {
    const { logp } = decode(space, tr, emit, filler, change, false);
    const total = logp + (tr === capo ? CAPO_PRIOR : 0);
    if (total > bestTotal) {
      bestTotal = total;
      bestTr = tr;
    }
  }
  const { path, logp } = decode(space, bestTr, emit, filler, change, true);
  const free = freeDecode(sheet, beats, bestTr, filler, change);
  if (path === null)
    throw new Error("unreachable: decode asked for a path returned none");

  const K = sheet.shapes.length;
  const confidence = new Float64Array(T);
  for (let t = 0; t < T; t++) {
    const s = path[t]!;
    const k = s >= space.size ? -1 : space.shapeOf[s]!;
    if (k < 0) continue;
    confidence[t] = beatConfidence(
      space,
      beats[t]!,
      s,
      bestTr,
      corr[(bestTr * T + t) * K + k]!,
    );
  }
  const segments = toSegments(space, path);
  const base = filler.reduce((sum, f) => sum + f, 0);
  const fit =
    free > base ? Math.min(1, Math.max(0, (logp - base) / (free - base))) : 0;
  const coverage = sheetCoverage(sheet, segments);
  const score = fit * coverage;

  const barConfidence = starts.map((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1]! : T;
    let sum = 0;
    for (let t = start; t < end; t++) sum += confidence[t]!;
    return sum / (end - start);
  });

  const record: AlignmentRecord = {
    alignerVersion: ALIGNER_VERSION,
    videoId: features.videoId,
    analysisVersion: features.analysisVersion,
    settingsKey: opts.settingsKey,
    sheetHash: opts.sheetHash,
    durationSec: features.durationSec,
    beats: features.beats.map((b) => ({ t: b.t, downbeat: b.downbeat })),
    transpose: bestTr,
    segments,
    barConfidence,
    score,
  };
  return {
    record,
    diagnostics: {
      constrained: logp / T,
      free: free / T,
      base: base / T,
      fit,
      coverage,
    },
  };
}
