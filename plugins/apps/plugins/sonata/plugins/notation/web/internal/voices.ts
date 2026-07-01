/**
 * PURE voice-partition — the load-bearing primitive behind true multi-voice
 * notation. Renderer-free and unit-tested.
 *
 * A *voice* is a sequence of note-units that never staggered-overlap: a unit is
 * a maximal set of notes sharing the **same `[start, end)`** (a real chord). Two
 * notes that overlap with *different* spans (one held while another moves) must
 * land in **different voices**. With that invariant, the converter's existing
 * run/quantize/decompose machinery — run *per voice* — produces clean tied
 * chords with **no re-articulation by construction**: voice 1's held note is
 * simply not in voice 2's note-set, so voice 2's onsets can't re-strike it.
 *
 * Two paths:
 *  - **Explicit voices honored first.** When notes carry a `voice` number, group
 *    by it (the clean path for sources that know their voicing). Groups are
 *    ordered by descending mean pitch so voice 0 is the upper line.
 *  - **Inference fallback** when `voice` is absent: collapse identical-span notes
 *    into chord-units, then greedily color the units with an interval-graph
 *    sweep + a pitch-coherence tiebreak, capped at `maxVoicesPerStaff`.
 */

/** The minimal note shape the partitioner needs — independent of the Score IR. */
export interface NoteLike {
  /** Stable identity, so the caller can map a group back to its full Note. */
  id: string;
  /** MIDI pitch — drives the pitch-lane ordering. */
  pitch: number;
  /** Start in quarter-note beats. */
  start: number;
  /** End in quarter-note beats (`start + duration`). */
  end: number;
  /** Explicit melodic line, when the source declares one. */
  voice?: number;
}

/** One partitioned voice — an ordered (top→bottom) bucket of notes. */
export interface VoiceGroup {
  notes: NoteLike[];
}

export interface PartitionOptions {
  /** Max simultaneous display voices on a staff (default 2; classical max 4). */
  maxVoicesPerStaff: number;
}

const EPS = 1e-6;

/** Round a beat to the 1/1000 grid so identical spans key together despite float. */
function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function meanPitch(notes: readonly NoteLike[]): number {
  if (notes.length === 0) return 0;
  let sum = 0;
  for (const n of notes) sum += n.pitch;
  return sum / notes.length;
}

/**
 * Partition a staff's notes into ordered voices (top→bottom by pitch). When any
 * note declares an explicit `voice`, that voicing is honored verbatim; otherwise
 * voices are inferred. Pure — never mutates the input.
 */
export function partitionVoices(
  notes: readonly NoteLike[],
  opts: PartitionOptions,
): VoiceGroup[] {
  if (notes.length === 0) return [];
  const hasExplicit = notes.some((n) => n.voice !== undefined);
  if (hasExplicit) return partitionByExplicitVoice(notes);
  const cap = Math.max(1, Math.min(4, opts.maxVoicesPerStaff));
  return inferVoices(notes, cap);
}

/** Group by the declared `voice` number, ordered by descending mean pitch. */
function partitionByExplicitVoice(notes: readonly NoteLike[]): VoiceGroup[] {
  const byVoice = new Map<number, NoteLike[]>();
  for (const n of notes) {
    // Notes with no explicit voice share a single sentinel bucket; ordering by
    // mean pitch still places it correctly relative to the declared voices.
    const v = n.voice ?? -1;
    const bucket = byVoice.get(v);
    if (bucket) bucket.push(n);
    else byVoice.set(v, [n]);
  }
  const groups = [...byVoice.values()].map((ns) => ({ notes: ns }));
  groups.sort((a, b) => meanPitch(b.notes) - meanPitch(a.notes));
  return groups;
}

/** A maximal set of notes sharing the exact same `[start, end)` — a real chord. */
interface Unit {
  start: number;
  end: number;
  notes: NoteLike[];
  mean: number;
}

/** One in-progress voice during the greedy sweep. */
interface WorkingVoice {
  units: Unit[];
  /** End beat of this voice's last-assigned unit (free iff `<= next.start`). */
  lastEnd: number;
  /** Mean pitch of this voice's last-assigned unit (drives the pitch tiebreak). */
  lastMean: number;
}

/**
 * Infer voices by interval-graph greedy coloring with a pitch-coherence tiebreak.
 *
 * Collapse identical-span notes into chord-units, sweep them in onset order
 * (higher pitch first within an onset, so the top line tends to claim a
 * lower-indexed voice), and assign each unit to the highest-priority *free*
 * voice (its last unit ends ≤ this unit's start), preferring the voice whose
 * pitch lane this unit best continues. Open a new voice up to the cap; beyond
 * it, merge the overflow unit into the nearest-pitch voice (re-articulation may
 * reappear only at that dense spot). Finally re-sort by descending mean pitch.
 */
function inferVoices(notes: readonly NoteLike[], maxVoices: number): VoiceGroup[] {
  const unitMap = new Map<string, NoteLike[]>();
  for (const n of notes) {
    const key = `${round(n.start)}:${round(n.end)}`;
    const bucket = unitMap.get(key);
    if (bucket) bucket.push(n);
    else unitMap.set(key, [n]);
  }
  const units: Unit[] = [...unitMap.values()].map((ns) => ({
    start: ns[0]!.start,
    end: ns[0]!.end,
    notes: ns,
    mean: meanPitch(ns),
  }));
  // Sweep by onset, then by descending pitch so the upper line is placed first.
  units.sort((a, b) => a.start - b.start || b.mean - a.mean);

  const voices: WorkingVoice[] = [];
  for (const u of units) {
    // Best *free* voice = smallest pitch-lane jump among those that have ended.
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < voices.length; i++) {
      if (voices[i]!.lastEnd <= u.start + EPS) {
        const dist = Math.abs(voices[i]!.lastMean - u.mean);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
    }
    if (best >= 0) {
      const v = voices[best]!;
      v.units.push(u);
      v.lastEnd = u.end;
      v.lastMean = u.mean;
      continue;
    }
    if (voices.length < maxVoices) {
      voices.push({ units: [u], lastEnd: u.end, lastMean: u.mean });
      continue;
    }
    // Cap reached: merge the overflow into the nearest-pitch voice. This is the
    // only place re-articulation can reappear (≥cap+1 genuinely staggered
    // lines) — documented, and matches engraving's display-voice cap.
    let near = 0;
    let nearDist = Infinity;
    for (let i = 0; i < voices.length; i++) {
      const dist = Math.abs(voices[i]!.lastMean - u.mean);
      if (dist < nearDist) {
        nearDist = dist;
        near = i;
      }
    }
    const v = voices[near]!;
    v.units.push(u);
    v.lastEnd = Math.max(v.lastEnd, u.end);
    v.lastMean = u.mean;
  }

  const groups = voices.map((v) => ({ notes: v.units.flatMap((u) => u.notes) }));
  groups.sort((a, b) => meanPitch(b.notes) - meanPitch(a.notes));
  return groups;
}
