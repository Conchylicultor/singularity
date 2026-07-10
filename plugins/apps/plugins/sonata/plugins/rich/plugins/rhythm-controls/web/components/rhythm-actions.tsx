import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { useGroove } from "../use-groove";

/**
 * Header-right control for the "Rhythm" section card: the On/Off groove toggle.
 * Lives in the contribution's `actions` (not the body) so it stays reachable
 * while the card is collapsed. Shares `useGroove()` with the body, so toggling
 * here and editing the circle there read and write one groove.
 */
export function RhythmActions() {
  const { enabled, bass, chord, commit } = useGroove();
  return (
    <ToggleChip
      active={enabled}
      onClick={() => commit({ bass, chord }, !enabled)}
    >
      {enabled ? "On" : "Off"}
    </ToggleChip>
  );
}
