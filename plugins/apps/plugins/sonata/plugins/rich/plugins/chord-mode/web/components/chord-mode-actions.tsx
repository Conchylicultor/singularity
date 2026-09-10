import { useState } from "react";
import {
  useChordMode,
  useSetChordMode,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  CHORD_BASS_TRACK,
  CHORD_TRACK,
} from "@plugins/apps/plugins/sonata/plugins/voicing/core";
import { setTracksActive } from "@plugins/apps/plugins/sonata/plugins/track-mixer/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { useSaveChordMode } from "../actions";

/**
 * Header-right control for the "Chords" section card: the per-song chord-mode
 * On/Off chip. The card has no body — this line IS the card — so the toggle
 * stays reachable however the column is collapsed.
 *
 * One click does two things, deliberately in an order that never doubles the
 * sound. The shell store flips synchronously (the pipeline re-voices at once),
 * while the track-mixer write lands a live-state round-trip later:
 *  - **On:** turn the original tracks off FIRST (await the mixer write), then
 *    flip the mode so the chord tracks appear — a beat of silence, never both
 *    layers at once.
 *  - **Off:** flip the mode first (chord tracks vanish), then bring the original
 *    tracks back.
 * "Original tracks" are every score track that is not one of the two synthesized
 * chord tracks. Which of them plays in chord mode is then the Tracks card's
 * business: un-hide / un-mute any of them like any other track.
 */
export function ChordModeActions() {
  const { score, currentSongId } = useSonata();
  const enabled = useChordMode();
  const setChordMode = useSetChordMode();
  const saveChordMode = useSaveChordMode();
  // Held while the awaited mixer write is in flight, so a second click cannot
  // interleave the two directions.
  const [busy, setBusy] = useState(false);

  const originals = score.tracks
    .filter((t) => t.id !== CHORD_TRACK && t.id !== CHORD_BASS_TRACK)
    .map((t) => t.id);

  const toggle = async () => {
    const next = !enabled;
    if (!currentSongId) {
      setChordMode(next);
      return;
    }
    setBusy(true);
    try {
      if (next) {
        if (originals.length > 0) {
          await setTracksActive(currentSongId, originals, false);
        }
        setChordMode(true); // optimistic: the chord tracks appear at once
        saveChordMode(currentSongId, true);
      } else {
        setChordMode(false); // optimistic: the chord tracks vanish at once
        saveChordMode(currentSongId, false);
        if (originals.length > 0) {
          await setTracksActive(currentSongId, originals, true);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToggleChip
      active={enabled}
      disabled={busy}
      onClick={() => void toggle()}
      title={
        enabled
          ? "Playing the detected chords on the Chords + Bass tracks. Turn off to play the song's own notes again."
          : "Play the detected chords (Chords + Bass tracks) and turn the original tracks off. Re-enable any track in the Tracks card."
      }
    >
      {enabled ? "On" : "Off"}
    </ToggleChip>
  );
}
