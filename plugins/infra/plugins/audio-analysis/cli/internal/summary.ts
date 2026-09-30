import type { BeatFeatures } from "../../core";

/** One song's beat grid in numbers, for the CLI and a by-ear check. */
export interface BeatSummary {
  beats: number;
  downbeats: number;
  /** 60 / the median inter-beat interval. */
  medianBpm: number;
  /** How many beats separate consecutive downbeats, most common first. */
  barLengths: Array<{ beats: number; bars: number }>;
  /** The share of bars that are 4 beats long. */
  fourBeatBars: number;
  durationSec: number;
}

export function summarizeBeats(features: BeatFeatures): BeatSummary {
  const times = features.beats.map((b) => b.t);
  const intervals = times.slice(1).map((t, i) => t - times[i]!);
  const sorted = [...intervals].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? NaN
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]!
        : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const downs = features.beats.flatMap((b, i) => (b.downbeat ? [i] : []));
  const counts = new Map<number, number>();
  for (let i = 1; i < downs.length; i++) {
    const n = downs[i]! - downs[i - 1]!;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const bars = downs.length - 1;
  return {
    beats: times.length,
    downbeats: downs.length,
    medianBpm: 60 / median,
    barLengths: [...counts]
      .map(([beats, n]) => ({ beats, bars: n }))
      .sort((a, b) => b.bars - a.bars),
    fourBeatBars: bars > 0 ? (counts.get(4) ?? 0) / bars : 0,
    durationSec: features.durationSec,
  };
}

export function formatSummary(s: BeatSummary): string {
  const lengths = s.barLengths
    .slice(0, 4)
    .map((l) => `${l.beats}×${l.bars}`)
    .join(" ");
  return (
    `${s.beats} beats, ${s.downbeats} downbeats, median ${s.medianBpm.toFixed(1)} BPM, ` +
    `${Math.round(s.fourBeatBars * 100)}% of bars 4 beats (beats×bars: ${lengths}), ${s.durationSec.toFixed(1)} s of audio`
  );
}
