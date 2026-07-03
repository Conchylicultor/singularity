/**
 * United chord-label formatter: given a chord, the key in force at its onset, and
 * a display mode, produce the single label string Sonata's chord surfaces render.
 *
 * The three faces of the chord model each answer one question — `formatChord-
 * Symbol` names the chord (letter name), `romanNumeral` names its function in a
 * key (scale-degree numeral). This composes those two into the *displayed* label
 * so every chord surface (the piano-roll overlay, the progression strip) shows
 * the same thing under one user preference, instead of each deciding for itself.
 *
 * Pure TypeScript: no React, no framework. Imports only `score/core` (types) and
 * the sibling `romanNumeral`, keeping the DAG acyclic.
 */

import type {
  ChordData,
  KeySignature,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { romanNumeral } from "./roman";

/** How a chord annotation is labeled across Sonata's chord displays. */
export type ChordDisplayMode = "symbol" | "roman" | "both";

/**
 * The label for `chord` under `mode`, using `key` (the key in force at the
 * chord's onset) to derive the Roman numeral. `key` is null for a keyless/atonal
 * score. The numeral is unavailable when there's no key or the quality is out of
 * vocab — in that case both `roman` and `both` gracefully fall back to the
 * symbol, so a label never vanishes.
 */
export function formatChordLabel(
  chord: ChordData,
  key: KeySignature | null,
  mode: ChordDisplayMode,
): string {
  const symbol = chord.symbol;
  if (mode === "symbol") return symbol;
  const roman = key ? romanNumeral(chord, key) : null;
  if (!roman) return symbol;
  if (mode === "roman") return roman;
  return `${symbol} (${roman})`;
}
