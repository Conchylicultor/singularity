import { useConfig } from "@plugins/config_v2/web";
import type { ChordDisplayMode } from "@plugins/apps/plugins/sonata/plugins/theory/core";
import { chordLabelConfig } from "../shared/config";

/**
 * The active chord-label display mode (`symbol` / `roman` / `both`), read
 * reactively from the shared config. Every chord surface (overlay, progression)
 * reads this so they label chords in lockstep.
 */
export function useChordDisplayMode(): ChordDisplayMode {
  return useConfig(chordLabelConfig).mode as ChordDisplayMode;
}
