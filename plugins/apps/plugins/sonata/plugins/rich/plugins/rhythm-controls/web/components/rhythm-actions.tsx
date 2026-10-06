import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import { useGroove } from "../use-groove";
import { useLibrarySong } from "@plugins/apps/plugins/sonata/plugins/document/web";

/**
 * Header-right control for the "Rhythm" section card: the On/Off groove toggle.
 * Lives in the contribution's `actions` (not the body) so it stays reachable
 * while the card is collapsed. Shares `useGroove()` with the body, so toggling
 * here and editing the circle there read and write one groove. A loading
 * placeholder while the song's groove is not known — "Off" would be a claim
 * about the song.
 */
export function RhythmActions() {
  const song = useLibrarySong();
  const groove = useGroove();
  // Only a library song's groove persists: a file document shows no editor.
  if (song.kind === "none") return null;
  if (groove.status === "loading") return <Loading variant="spinner" />;
  if (groove.status === "error") {
    return (
      <ResourceErrorInline
        variant="icon"
        subject="this song's rhythm"
        error={groove.error}
        refetch={groove.refetch}
      />
    );
  }
  const { enabled, bass, chord, bassFigurationId, chordFigurationId, commit } =
    groove.data;
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
