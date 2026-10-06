import {
  bars,
  scoreEndBeat,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/** One fact of the preview's header: an emphasized value and its plain unit. */
export interface MidiFact {
  id: string;
  value: string;
  unit?: string;
}

const PITCH_NAMES = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
] as const;

/** A MIDI pitch as a note name with its octave (60 → C4). */
export function pitchLabel(pitch: number): string {
  return `${PITCH_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

/** Bytes as the size a person reads (`812 B`, `12.3 KB`, `1.4 MB`). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * What a MIDI file holds at a glance, read off its composed score: tempo,
 * meter, length in bars, tracks and notes, pitch range, and the file's size.
 * The duration is formatted by the caller (it owns the clock format). A tempo
 * or meter change mid-song shows the opening one; an empty file has no range.
 */
export function midiFacts(score: Score, sizeBytes: number): MidiFact[] {
  const facts: MidiFact[] = [];
  const bpm = score.tempoMap[0]?.bpm;
  if (bpm !== undefined) {
    facts.push({ id: "bpm", value: String(Math.round(bpm)), unit: "BPM" });
  }
  const sig = score.timeSigMap[0] ?? { numerator: 4, denominator: 4 };
  facts.push({ id: "meter", value: `${sig.numerator}/${sig.denominator}` });
  // `bars()` also lists a bar starting exactly AT the end; only bars that hold
  // part of the song count.
  const end = scoreEndBeat(score);
  const barCount = bars(score).filter((b) => b.startBeat < end).length;
  facts.push({
    id: "bars",
    value: String(barCount),
    unit: barCount === 1 ? "bar" : "bars",
  });
  const trackCount = score.tracks.length;
  facts.push({
    id: "tracks",
    value: String(trackCount),
    unit: `${trackCount === 1 ? "track" : "tracks"} · ${score.notes.length} notes`,
  });
  if (score.notes.length > 0) {
    let low = Infinity;
    let high = -Infinity;
    for (const n of score.notes) {
      low = Math.min(low, n.pitch);
      high = Math.max(high, n.pitch);
    }
    facts.push({
      id: "range",
      value: `${pitchLabel(low)}–${pitchLabel(high)}`,
    });
  }
  facts.push({ id: "size", value: formatBytes(sizeBytes) });
  return facts;
}
