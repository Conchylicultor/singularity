import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useGroove } from "../use-groove";

/**
 * Header-right control for the "Rhythm" section card: the On/Off groove toggle.
 * Lives in the contribution's `actions` (not the body) so it stays reachable
 * while the card is collapsed. Shares `useGroove()` with the body, so toggling
 * here and editing the circle there read and write one groove. A loading
 * placeholder while the song's groove is not known — "Off" would be a claim
 * about the song.
 */
export function RhythmActions() {
  const groove = useGroove();
  if (groove.pending) return <Loading variant="spinner" />;
  const { enabled, bass, chord, bassFigurationId, chordFigurationId, commit } =
    groove;
  return (
    <ToggleChip
      active={enabled}
      onClick={() =>
        commit({ bass, chord, bassFigurationId, chordFigurationId }, !enabled)
      }
    >
      {enabled ? "On" : "Off"}
    </ToggleChip>
  );
}
