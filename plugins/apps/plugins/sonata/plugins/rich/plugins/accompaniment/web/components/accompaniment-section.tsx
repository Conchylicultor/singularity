import {
  useHasVoicedChords,
  useLibrarySong,
} from "@plugins/apps/plugins/sonata/plugins/document/web";
import {
  ChordModeRow,
  useChordModeAvailable,
} from "@plugins/apps/plugins/sonata/plugins/rich/plugins/chord-mode/web";
import {
  GrooveSwitch,
  RhythmControls,
  useGroove,
} from "@plugins/apps/plugins/sonata/plugins/rich/plugins/rhythm-controls/web";
import { VoicingControls } from "@plugins/apps/plugins/sonata/plugins/rich/plugins/voicing-controls/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Separator } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Offered when chord mode can be flipped OR the song's chords are voiced. Both
 * hooks run unconditionally (rules of hooks).
 */
export function useAccompanimentAvailable(): boolean {
  const chordModeAvailable = useChordModeAvailable();
  const voiced = useHasVoicedChords();
  return chordModeAvailable || voiced;
}

/** Header action: the groove switch, only while there are voiced chords to groove. */
export function AccompanimentActions() {
  const voiced = useHasVoicedChords();
  return voiced ? <GrooveSwitch /> : null;
}

/**
 * The Accompaniment body: the chord-mode row, then (when the song's chords are
 * voiced) the groove body and the voicing rows, separated by rules.
 */
export function AccompanimentSection() {
  const chordModeAvailable = useChordModeAvailable();
  const voiced = useHasVoicedChords();
  const grooveShown = useGrooveBodyShown();

  return (
    <Stack gap="md">
      {chordModeAvailable && <ChordModeRow />}
      {chordModeAvailable && voiced && <Separator />}
      {voiced && grooveShown && (
        <>
          <RhythmControls />
          <Separator />
        </>
      )}
      {voiced && <VoicingControls />}
    </Stack>
  );
}

/**
 * Whether `RhythmControls` draws anything — it renders nothing for a file
 * document and while the groove is known to be off, and a rule after an empty
 * body would dangle.
 */
function useGrooveBodyShown(): boolean {
  const song = useLibrarySong();
  const groove = useGroove();
  if (song.kind === "none") return false;
  return groove.status !== "ready" || groove.data.enabled;
}
