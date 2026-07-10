import { useMemo } from "react";
import {
  useKeyAutoDetect,
  useSetKeyAutoDetect,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { saveKeyAutoDetect } from "@plugins/apps/plugins/sonata/plugins/rich/plugins/key-mode/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { collectKeyEntries } from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * Header-right control for the "Current key" section card: the per-song
 * "Auto-detect key" toggle. Lives in the contribution's `actions` (not the body)
 * so it stays reachable while the card is collapsed. Re-derives `showToggle` from
 * the same score entries the body reads, and renders nothing when the song has no
 * authored key to override.
 */
export function KeyReadoutActions() {
  const { score, currentSongId } = useSonata();
  const keyAutoDetect = useKeyAutoDetect();
  const setKeyAutoDetect = useSetKeyAutoDetect();

  const entries = useMemo(() => collectKeyEntries(score), [score]);

  // Show the toggle only for songs that carry an authored key to override — or
  // that already have the override on (in which case the authored key is stripped
  // from `entries`, so OR the live flag).
  const showToggle =
    entries.some((e) => e.source === "authored") || keyAutoDetect;

  if (!showToggle) return null;

  const toggleAutoDetect = () => {
    const next = !keyAutoDetect;
    setKeyAutoDetect(next); // optimistic: re-spell/readout update instantly
    if (currentSongId) saveKeyAutoDetect(currentSongId, next); // persist per song
  };

  return (
    <ToggleChip
      active={keyAutoDetect}
      variant="ghost"
      onClick={toggleAutoDetect}
      title={
        keyAutoDetect
          ? "Using a key auto-detected from the notes. Turn off to use the song's own (MIDI) key."
          : "Using the song's own (MIDI) key. Turn on to auto-detect the key from the notes instead."
      }
    >
      Auto-detect
    </ToggleChip>
  );
}
