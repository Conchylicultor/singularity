import {
  useChordMode,
  useHasDerivedChord,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";

/**
 * The "Chords" card is offered when the song has detected chords to voice — or
 * when the mode is already on, so a stale "on" (say, after the song's MIDI was
 * re-imported and detection now finds nothing) can always be switched off.
 */
export function useChordModeAvailable(): boolean {
  const hasDerived = useHasDerivedChord();
  const enabled = useChordMode();
  return hasDerived || enabled;
}
