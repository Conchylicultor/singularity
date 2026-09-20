import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import {
  asChordSoundSource,
  type ChordSoundSource,
} from "@plugins/apps/plugins/chord/plugins/piano/core";
import { chordSoundConfig } from "../../shared/config";

/**
 * Which sound a chord of the loop is heard with right now.
 *
 * Plain `useConfig`, not `useConfigResult`, and that is the documented-correct
 * choice here rather than a shortcut: the config document is hydrated into the
 * boot snapshot and its resource is resident, so the unknown window is normally
 * unreachable — and the value makes no claim about the learner's DATA. Reading
 * the default for one frame cannot state something false about them; the worst
 * case is that a click in that first frame plays the wrong one of two sounds.
 * The rule this follows is written on `useConfig` itself: read the
 * result-carrying form when the value decides whether a surface says "nothing
 * here", and the plain form for a preference.
 *
 * The read is narrowed through `asChordSoundSource` because `enumField` types
 * as `string`.
 */
export function useChordSoundSource(): ChordSoundSource {
  return asChordSoundSource(useConfig(chordSoundConfig).source);
}

/** Set which sound a chord of the loop is heard with. */
export function useSetChordSoundSource(): (source: ChordSoundSource) => void {
  const setConfig = useSetConfig(chordSoundConfig);
  return (source) => setConfig("source", source);
}
