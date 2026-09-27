import {
  chordModeSetting,
  useHasDerivedChord,
  useSongSetting,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";

/**
 * The "Chords" card is offered when the song has detected chords to voice — or
 * when the mode is already on, so a stale "on" (say, after the song's MIDI was
 * re-imported and detection now finds nothing) can always be switched off.
 * While the mode is pending the song's settings are still loading, so the score
 * is empty and there is no card to offer yet.
 */
export function useChordModeAvailable(): boolean {
  const hasDerived = useHasDerivedChord();
  const enabled = useSongSetting(chordModeSetting);
  if (enabled.pending) return false;
  return hasDerived || enabled.value;
}
