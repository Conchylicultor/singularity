/**
 * "What key is in effect, and where" — the canonical key-context resolver.
 *
 * A song's tonal centre is meaning layered on top of the notes, so the IR keeps
 * it in exactly two places: the *starting* key (`score.meta.key`) and any
 * mid-song key changes, modelled as `type:"key"` annotations. This module is the
 * single seam that reconciles those two into a beat-indexed answer, so every
 * consumer (note spelling, chord spelling, the progress-bar key flags) reads the
 * same notion of "the key here" instead of each re-deriving it.
 *
 * Pure TypeScript: no React, no framework. Imports only sibling `./types` — this
 * is the DAG leaf.
 */
import type { Annotation, KeySignature, Score } from "./types";

/**
 * A key established at a given beat (beat 0 for the starting key), tagged with
 * its provenance so readouts can show "From MIDI" (authored) vs "Auto-detected"
 * (derived). `meta.key` is authored truth by definition; annotations carry their
 * own `source`/`confidence`.
 */
export type KeyEntry = {
  beat: number;
  key: KeySignature;
  source: "authored" | "derived";
  /** [0,1] confidence for derived keys (Krumhansl correlation); undefined for authored. */
  confidence?: number;
};

/**
 * Defensive narrowing of an annotation's `unknown` data to a `KeySignature`:
 * an object with a string `tonic` and a `mode` of "major" | "minor".
 *
 * No input source declares a `KeyData` shape, so a `key` annotation's `data` is
 * typed as `unknown` and must be narrowed here rather than trusted.
 */
export function asKeySignature(a: Annotation): KeySignature | null {
  const data = a.data;
  if (typeof data !== "object" || data === null) return null;
  const { tonic, mode } = data as Record<string, unknown>;
  if (typeof tonic !== "string") return null;
  if (mode !== "major" && mode !== "minor") return null;
  return { tonic, mode };
}

/**
 * Resolve the song's key entries from the Score: the starting `meta.key` at
 * beat 0 plus every well-formed `key` annotation. If an annotation also sits at
 * beat 0 it wins over the meta starting key, so a single beat never carries two
 * conflicting entries. Returned sorted ascending by beat.
 */
export function collectKeyEntries(score: Score): KeyEntry[] {
  const byBeat = new Map<number, Omit<KeyEntry, "beat">>();

  // The starting key is authored truth by definition.
  if (score.meta.key) byBeat.set(0, { key: score.meta.key, source: "authored" });

  for (const a of score.annotations) {
    if (a.type !== "key") continue;
    const key = asKeySignature(a);
    if (!key) continue; // skip malformed payloads — fail quietly, not loudly here.
    // An annotation at beat 0 overrides meta.key — and carries its own source,
    // so a derived key at beat 0 (auto-detect) reads as derived, not authored.
    byBeat.set(a.start, { key, source: a.source, confidence: a.confidence });
  }

  return [...byBeat.entries()]
    .map(([beat, entry]) => ({ beat, ...entry }))
    .sort((x, y) => x.beat - y.beat);
}

/**
 * The key in force at `beat`: the `key` of the latest entry whose beat is at or
 * before `beat`, or `undefined` when no key is established by then (e.g. a
 * keyless score, or a beat before the first entry). Entries are ascending, so we
 * keep the last one that still satisfies `entry.beat <= beat`.
 */
export function effectiveKeyAt(
  score: Score,
  beat: number,
): KeySignature | undefined {
  const entries = collectKeyEntries(score);
  let active: KeySignature | undefined;
  for (const e of entries) {
    if (e.beat <= beat) active = e.key;
    else break; // ascending: no later entry can satisfy beat <= `beat`.
  }
  return active;
}
