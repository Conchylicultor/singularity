import {
  effectiveOnsets,
  type RhythmPattern,
} from "@plugins/apps/plugins/sonata/plugins/rhythm/core";
import { findFiguration } from "@plugins/apps/plugins/sonata/plugins/voicing/core";
import type { GroovePreset } from "./groove-presets";

/**
 * A song's groove content plus its provenance — each hand's rhythm necklace
 * (*when*) and tone-order figuration id (*what*), and the preset it was last
 * applied from (`null`: never applied from one). The `commit` payload: callers
 * spread the resolved groove and override one field.
 */
export interface GrooveFields {
  presetId: string | null;
  bass: RhythmPattern;
  chord: RhythmPattern;
  bassFigurationId: string;
  chordFigurationId: string;
}

/**
 * What a groove SOUNDS like — `GrooveFields` without provenance. A
 * `GroovePreset` satisfies it structurally, so a song's groove and a preset
 * compare directly.
 */
export type GrooveContent = Omit<GrooveFields, "presetId">;

/** Same pulse count and the same struck pulses, however the rotation is spelt. */
function patternEquals(a: RhythmPattern, b: RhythmPattern): boolean {
  if (a.subdivisions !== b.subdivisions) return false;
  const ea = effectiveOnsets(a);
  const eb = effectiveOnsets(b);
  return ea.length === eb.length && ea.every((o, i) => o === eb[i]);
}

/**
 * Whether two grooves sound the same: both hands' subdivisions and effective
 * onsets, and both figuration ids. Provenance is ignored (a pattern's
 * `presetId`, a groove's `presetId`), and so is how a rotation is represented
 * (`rotation: 2` over raw onsets vs. the pre-rotated onsets) — the basis of a
 * preset's "edited" mark.
 */
export function grooveEquals(a: GrooveContent, b: GrooveContent): boolean {
  return (
    a.bassFigurationId === b.bassFigurationId &&
    a.chordFigurationId === b.chordFigurationId &&
    patternEquals(a.bass, b.bass) &&
    patternEquals(a.chord, b.chord)
  );
}

/**
 * One-line description of a groove's hands, right hand first: "Block ·
 * Root–fifth". Throws on an unknown figuration id (via `findFiguration`).
 */
export function grooveSummary(g: GrooveContent): string {
  return `${findFiguration(g.chordFigurationId).label} · ${findFiguration(g.bassFigurationId).label}`;
}

/** The groove a preset applies: its content, with the preset as provenance. */
export function presetGroove(p: GroovePreset): GrooveFields {
  return {
    presetId: p.id,
    bass: p.bass,
    chord: p.chord,
    bassFigurationId: p.bassFigurationId,
    chordFigurationId: p.chordFigurationId,
  };
}
