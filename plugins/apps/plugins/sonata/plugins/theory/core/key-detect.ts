/**
 * Key inference — "what key is this music in?", derived purely from the notes.
 *
 * Most MIDI files carry no key header (`score.meta.key` is empty), so to spell
 * accidentals and chord roots correctly we must *infer* the tonal centre from
 * the pitches themselves. This module implements the classic Krumhansl–Schmuckler
 * algorithm: build a duration-weighted pitch-class histogram and correlate it
 * against the Krumhansl–Kessler "key profiles" (empirically-derived tonal
 * hierarchies). The profile that best correlates names the key.
 *
 * Inference is *windowed* (per bar) so a piece that modulates emits a `key`
 * annotation at each region boundary; a single `effectiveKeyAt(score, beat)`
 * resolver downstream then spells every note/chord in *its* section's key.
 *
 * Pure TypeScript: no React, no framework. Imports only `score/core` — `theory`
 * may depend on `score`, never the reverse, so the DAG stays acyclic.
 */

import {
  bars,
  type Annotation,
  type KeySignature,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

// ---------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------

/**
 * Confidence floor (atonal guard). If the whole-score best correlation is below
 * this, the content is too tonally ambiguous (atonal, percussive, a chromatic
 * cluster) to name a key — we infer nothing and leave today's normalized-sharps
 * behaviour in place. Pearson correlation ranges [-1, 1]; a clearly-tonal piece
 * scores well above 0.7 against its true key, so 0.5 separates real keys from
 * noise without rejecting genuine but weakly-stated tonality.
 */
const CONFIDENCE_FLOOR = 0.5;

/**
 * Minimum length (in bars) of an inferred key region. Single-bar key "guesses"
 * are almost always histogram noise on a passing chromatic bar, not a real
 * modulation; coalescing such short regions into their neighbours prevents the
 * inferred key from flapping bar-to-bar.
 */
const MIN_REGION_BARS = 2;

/**
 * Krumhansl–Kessler key profiles — the empirically-measured "tonal hierarchy":
 * for a given mode, the relative perceptual stability of each scale degree,
 * indexed by semitones above the tonic (0 = tonic, 1 = ♭2/♯1, … 11 = leading
 * tone). The tonic, dominant (7) and mediant (3/4) dominate; chromatic degrees
 * sit low. We correlate a histogram (rotated so index 0 = the candidate tonic)
 * against these to score how well that tonic explains the music.
 */
const MAJOR_PROFILE: readonly number[] = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE: readonly number[] = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

/**
 * Conventional key NAME per `(pitch-class, mode)`, chosen as the spelling with
 * the *fewest accidentals* — never nonsense like "B#"/"G#" major. `makeKeySpeller`
 * downstream derives the whole signature from this tonic string, so it must be a
 * sane enharmonic key. Major and minor differ where the fewest-accidental choice
 * differs (e.g. pc 1 is D♭ major but C♯ minor; pc 6 is F♯ in both; pc 8 is A♭
 * major but G♯ minor).
 */
const MAJOR_NAMES: readonly string[] = [
  "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
];
const MINOR_NAMES: readonly string[] = [
  "C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B",
];

// ---------------------------------------------------------------------------
// Histogram + correlation
// ---------------------------------------------------------------------------

/**
 * Duration-weighted pitch-class histogram over `[start, end)`. Each sounding
 * note contributes the length of its overlap with the window into `hist[pitch %
 * 12]` — weighting by *time sounded*, not note count, so a held whole note
 * matters more than a passing sixteenth. A note that only partially overlaps the
 * window contributes only its overlapping fraction.
 */
function windowHistogram(score: Score, start: number, end: number): number[] {
  const hist = new Array<number>(12).fill(0);
  for (const n of score.notes) {
    const noteStart = n.start;
    const noteEnd = n.start + n.duration;
    const overlap = Math.min(noteEnd, end) - Math.max(noteStart, start);
    if (overlap <= 0) continue;
    const pc = ((n.pitch % 12) + 12) % 12;
    hist[pc]! += overlap;
  }
  return hist;
}

/**
 * Pearson correlation coefficient between two equal-length numeric vectors.
 * Returns 0 for a degenerate (zero-variance) vector — e.g. a silent window or a
 * single-pitch drone — so such windows fall below the confidence floor rather
 * than producing a spurious NaN-driven "key".
 */
function pearson(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i]!;
    sumB += b[i]!;
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - meanA;
    const db = b[i]! - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return 0;
  return cov / Math.sqrt(varA * varB);
}

/** The best (pc, mode) key for a histogram, with its correlation strength. */
interface KeyGuess {
  pc: number;
  mode: "major" | "minor";
  correlation: number;
}

/**
 * Score all 24 keys against `hist` and return the best. For each candidate tonic
 * `t`, we correlate the profile against the histogram *rotated* so index 0 reads
 * the candidate tonic's pitch-class (i.e. compare `profile[i]` to `hist[(t + i)
 * % 12]`). Best = highest Pearson correlation across both modes and all tonics.
 */
function bestKey(hist: readonly number[]): KeyGuess {
  let best: KeyGuess = { pc: 0, mode: "major", correlation: -Infinity };

  for (let t = 0; t < 12; t++) {
    // Rotate the histogram so index = semitones above the candidate tonic `t`.
    const rotated = new Array<number>(12);
    for (let i = 0; i < 12; i++) rotated[i] = hist[(t + i) % 12]!;

    const major = pearson(MAJOR_PROFILE, rotated);
    if (major > best.correlation) {
      best = { pc: t, mode: "major", correlation: major };
    }
    const minor = pearson(MINOR_PROFILE, rotated);
    if (minor > best.correlation) {
      best = { pc: t, mode: "minor", correlation: minor };
    }
  }

  return best;
}

/**
 * Conventional, fewest-accidental tonic name for a `(pc, mode)` pair. Exported
 * so the fewest-accidental naming table has ONE home, reused by both `inferKeys`
 * (here) and `transposeScore`/`transposeKey` (sibling `transpose.ts`).
 */
export function tonicName(pc: number, mode: "major" | "minor"): string {
  return (mode === "major" ? MAJOR_NAMES : MINOR_NAMES)[pc]!;
}

// ---------------------------------------------------------------------------
// inferKeys
// ---------------------------------------------------------------------------

/** A window over a single bar (or the whole score in the fallback case). */
interface Window {
  start: number;
  end: number;
}

/** A run of consecutive bars sharing the same inferred key. */
interface Region {
  /** Index into the bar windows where the region starts (inclusive). */
  fromBar: number;
  /** Index where the region ends (exclusive). */
  toBar: number;
  pc: number;
  mode: "major" | "minor";
  /** The region's representative correlation (the first bar's), as confidence. */
  correlation: number;
}

/**
 * Infer the song's key(s) from its notes and emit `source:"derived"` `key`
 * annotations — one per inferred region, including the first at its start beat.
 *
 * Returns the score UNCHANGED when:
 *  - the score already has an authored key (`meta.key` set, or any authored
 *    `key` annotation) AND `opts.force` is not set — by default we trust
 *    authored truth; modulation inference over header-keyed files is a later
 *    improvement; or
 *  - the whole-score best correlation is below the confidence floor (atonal /
 *    percussive / ambiguous) — graceful degradation to normalized-only.
 *
 * With `opts.force` (the per-song "auto-detect key" override), any authored key
 * is FIRST stripped — `meta.key` cleared and authored `key` annotations dropped —
 * so the song is treated as keyless and the key is inferred from the notes. This
 * makes the whole downstream pipeline (note spelling, chord analysis, the
 * readout) use the inferred key, exactly as it would for a genuinely keyless
 * song. Outside `force`, never touches `meta.key`; only appends annotations.
 */
export function inferKeys(score: Score, opts?: { force?: boolean }): Score {
  // 1. Authored truth. By default, bail if a key is already declared. With
  // `force`, instead strip it so inference below replaces it (and so the
  // `hasAuthoredKey` check downstream sees a clean, keyless score).
  const hasAuthoredKey =
    score.meta.key !== undefined ||
    score.annotations.some((a) => a.type === "key" && a.source === "authored");
  if (hasAuthoredKey) {
    if (!opts?.force) return score;
    score = {
      ...score,
      meta: { ...score.meta, key: undefined },
      annotations: score.annotations.filter(
        (a) => !(a.type === "key" && a.source === "authored"),
      ),
    };
  }

  if (score.notes.length === 0) return score;

  // The last beat any note sounds — closes the final bar's window.
  let scoreEnd = 0;
  for (const n of score.notes) scoreEnd = Math.max(scoreEnd, n.start + n.duration);

  // 2. Windows: one per bar `[barStart, nextBarStart)`, the last closing at the
  // score's end. With too few bars to window meaningfully, fall back to a single
  // whole-score window.
  const barStarts = bars(score).map((b) => b.startBeat);
  let windows: Window[];
  if (barStarts.length < 2) {
    windows = [{ start: 0, end: scoreEnd }];
  } else {
    windows = barStarts.map((start, i) => ({
      start,
      end: i + 1 < barStarts.length ? barStarts[i + 1]! : scoreEnd,
    }));
  }

  // 5a. Confidence floor (atonal guard) — compute a GLOBAL histogram over the
  // whole score; if even its best key is weak, the content has no usable tonal
  // centre, so infer nothing.
  const globalHist = windowHistogram(score, 0, scoreEnd);
  const globalBest = bestKey(globalHist);
  if (globalBest.correlation < CONFIDENCE_FLOOR) return score;

  // 3–5. Per-window best key. A window below the floor inherits the previous
  // window's key rather than emitting a weak guess (prevents one chromatic bar
  // from injecting a bogus modulation).
  const perBar: KeyGuess[] = [];
  let prev: KeyGuess = globalBest; // seed with the global key for an early weak bar.
  for (const w of windows) {
    const hist = windowHistogram(score, w.start, w.end);
    const guess = bestKey(hist);
    const effective = guess.correlation < CONFIDENCE_FLOOR ? prev : guess;
    perBar.push(effective);
    prev = effective;
  }

  // 6a. Coalesce consecutive bars with the same (pc, mode) into regions.
  const regions: Region[] = [];
  for (let i = 0; i < perBar.length; i++) {
    const g = perBar[i]!;
    const last = regions[regions.length - 1];
    if (last && last.pc === g.pc && last.mode === g.mode) {
      last.toBar = i + 1;
    } else {
      regions.push({
        fromBar: i,
        toBar: i + 1,
        pc: g.pc,
        mode: g.mode,
        correlation: g.correlation,
      });
    }
  }

  // 6b. Smooth: drop sub-`MIN_REGION_BARS` regions by merging them into the
  // PRECEDING region (or the FOLLOWING one, for a too-short first region). This
  // absorbs flapping while preserving genuine multi-bar modulations. Iterate to
  // a fixed point so merges that create new adjacencies also collapse.
  let changed = true;
  while (changed && regions.length > 1) {
    changed = false;
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i]!;
      if (r.toBar - r.fromBar >= MIN_REGION_BARS) continue;

      if (i > 0) {
        // Merge into the preceding region: it absorbs this region's bars.
        const prevR = regions[i - 1]!;
        prevR.toBar = r.toBar;
        regions.splice(i, 1);
      } else if (regions.length > 1) {
        // First region too short: fold it into the following region's key.
        const nextR = regions[i + 1]!;
        nextR.fromBar = r.fromBar;
        regions.splice(i, 1);
      }
      changed = true;
      break;
    }
  }

  // 7–8. Spell each region's tonic and emit a derived `key` annotation. The
  // region spans `[firstBarStart, lastBarEnd)` in beats.
  const keyAnnotations: Annotation[] = regions.map((r) => {
    const startBeat = windows[r.fromBar]!.start;
    const endBeat = windows[r.toBar - 1]!.end;
    const tonic = tonicName(r.pc, r.mode);
    return {
      type: "key",
      start: startBeat,
      end: endBeat,
      data: { tonic, mode: r.mode } satisfies KeySignature,
      source: "derived",
      // Pearson correlation is in [-1, 1]; we only reach here above the floor
      // (≥ 0.5), so clamp to [0, 1] for a presentable confidence.
      confidence: Math.max(0, Math.min(1, r.correlation)),
    };
  });

  return {
    ...score,
    annotations: [...score.annotations, ...keyAnnotations],
  };
}
