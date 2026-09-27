import { useMemo } from "react";
import {
  keyAutoDetectSetting,
  useSongSetting,
  useSonata,
  useWriteSongSetting,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { saveKeyAutoDetect } from "@plugins/apps/plugins/sonata/plugins/rich/plugins/key-mode/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { collectKeyEntries } from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * Header-right control for the "Current key" section card: the per-song
 * "Auto-detect key" toggle. Lives in the contribution's `actions` (not the body)
 * so it stays reachable while the card is collapsed. Re-derives `showToggle` from
 * the same score entries the body reads, and renders nothing when the song has no
 * authored key to override. While the song's setting is loading it is a loading
 * placeholder — "off" would be a claim about the song.
 */
export function KeyReadoutActions() {
  const { score, currentSongId } = useSonata();
  const keyAutoDetect = useSongSetting(keyAutoDetectSetting);
  const setKeyAutoDetect = useWriteSongSetting(keyAutoDetectSetting);

  const entries = useMemo(() => collectKeyEntries(score), [score]);

  if (keyAutoDetect.pending) return <Loading variant="spinner" />;
  const autoDetect = keyAutoDetect.value;

  // Show the toggle only for songs that carry an authored key to override — or
  // that already have the override on (in which case the authored key is stripped
  // from `entries`, so OR the live flag).
  const showToggle = entries.some((e) => e.source === "authored") || autoDetect;

  if (!showToggle || currentSongId === null) return null;

  const toggleAutoDetect = () => {
    const next = !autoDetect;
    setKeyAutoDetect(currentSongId, next); // optimistic: re-spell/readout update instantly
    saveKeyAutoDetect(currentSongId, next); // persist per song
  };

  return (
    <ToggleChip
      active={autoDetect}
      variant="ghost"
      onClick={toggleAutoDetect}
      title={
        autoDetect
          ? "Using a key auto-detected from the notes. Turn off to use the song's own (MIDI) key."
          : "Using the song's own (MIDI) key. Turn on to auto-detect the key from the notes instead."
      }
    >
      Auto-detect
    </ToggleChip>
  );
}
