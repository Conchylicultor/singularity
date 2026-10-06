import {
  ANALYSIS_VERSION,
  BeatFeaturesSchema,
  type BeatFeatures,
} from "@plugins/infra/plugins/audio-analysis/core";
import {
  parseChordSymbol,
  qualityToIntervals,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";

export interface SynthFeaturesOptions {
  /** Seconds per beat (default 0.5). */
  beatSec?: number;
  /** Time of the first beat (default 0.5). */
  startSec?: number;
  /** Downbeat every N beats (default 4). */
  beatsPerBar?: number;
  /** Index of the first downbeat (default 0); earlier beats are a pickup. */
  firstDownbeat?: number;
  /** Uniform noise amplitude added to every bin before normalising (default 0.15). */
  noise?: number;
  /** Seed of the deterministic noise (default 1). */
  seed?: number;
  /** Per-beat relative rms (default 1 for chords, 0.02 for silence). */
  rms?: (beat: number) => number;
  videoId?: string;
}

/** Mulberry32: a tiny seeded PRNG, so every run renders the same features. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pc12 = (pc: number): number => ((pc % 12) + 12) % 12;

function maxNormalised(v: number[]): number[] {
  const max = Math.max(...v);
  return v.map((x) => Math.round((max > 0 ? x / max : 0) * 1e4) / 1e4);
}

/**
 * Synthetic beat features from one chord symbol per beat (`null` = silence:
 * pure noise at low rms; a symbol theory cannot read throws). Each chord's
 * tones light the treble chroma, its bass (or root) the bass chroma, plus
 * seeded noise. Deterministic and valid against `BeatFeaturesSchema`.
 */
export function synthFeatures(
  chords: readonly (string | null)[],
  opts: SynthFeaturesOptions = {},
): BeatFeatures {
  const beatSec = opts.beatSec ?? 0.5;
  const startSec = opts.startSec ?? 0.5;
  const perBar = opts.beatsPerBar ?? 4;
  const firstDown = opts.firstDownbeat ?? 0;
  const noise = opts.noise ?? 0.15;
  const rand = prng(opts.seed ?? 1);

  const beats = chords.map((symbol, i) => {
    const chroma = Array.from({ length: 12 }, () => rand() * noise);
    const bass = Array.from({ length: 12 }, () => rand() * noise);
    if (symbol === null) {
      for (let k = 0; k < 12; k++) {
        chroma[k]! += rand() * 0.5;
        bass[k]! += rand() * 0.5;
      }
    } else {
      const data = parseChordSymbol(symbol);
      if (data === null)
        throw new Error(
          `synthFeatures: unreadable chord ${JSON.stringify(symbol)}`,
        );
      const intervals = data.intervals ?? qualityToIntervals(data.quality);
      chroma[data.root]! += 1;
      for (const iv of intervals) chroma[pc12(data.root + iv)]! += 0.7;
      bass[data.bass ?? data.root]! += 1;
    }
    const pos = i - firstDown;
    return {
      t: Math.round((startSec + i * beatSec) * 1e4) / 1e4,
      downbeat: pos >= 0 && pos % perBar === 0,
      barPos: pos < 0 ? 0 : (pos % perBar) + 1,
      chroma: maxNormalised(chroma),
      bass: maxNormalised(bass),
      rms: opts.rms?.(i) ?? (symbol === null ? 0.02 : 1),
    };
  });

  return BeatFeaturesSchema.parse({
    videoId: opts.videoId ?? "synthetic",
    analysisVersion: ANALYSIS_VERSION,
    durationSec: startSec + chords.length * beatSec,
    sampleRate: 22050,
    tuningCents: 0,
    beats,
    source: {
      audioFormat: "synthetic",
      ytDlpVersion: "none",
      model: "synthetic",
      device: "cpu",
      settings: { beatModel: "final0", chroma: "fast" },
    },
  });
}
