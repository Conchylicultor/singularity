import { isPedalDownAt } from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  useCursorSelector,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";

/**
 * A cross-lens "Ped." indicator in the Sonata toolbar: a passive chip (rendered
 * as a `span`, never a button) that glows while the sustain pedal is engaged at
 * the playback cursor. Display-agnostic — it reads `score.pedalEvents` directly,
 * so it shows in every lens (piano roll, notation, songsheet), unlike the roll's
 * capability-gated pedal lane.
 *
 * `useCursorSelector` re-renders ONLY on the down↔up transition (not every
 * frame). Hidden entirely for a song with no pedaling, so the toolbar stays
 * clean for unpedalled content.
 */
export function PedalIndicator() {
  const { score } = useSonata();
  const down = useCursorSelector(
    (beat) => isPedalDownAt(score.pedalEvents, beat),
    [score.pedalEvents],
  );
  if (score.pedalEvents.length === 0) return null;

  return (
    <ToggleChip
      as="span"
      active={down}
      title={down ? "Sustain pedal — down" : "Sustain pedal"}
      aria-label="Sustain pedal"
    >
      Ped.
    </ToggleChip>
  );
}
