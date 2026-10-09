import { Switch } from "@plugins/primitives/plugins/css/plugins/switch/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import { useLibrarySong } from "@plugins/apps/plugins/sonata/plugins/document/web";
import { useGroove } from "../use-groove";

/**
 * The groove on/off switch, for the header of whatever section composes the
 * groove body (`RhythmControls`) — so it stays reachable while that section is
 * collapsed. Shares `useGroove()` with the body, so flipping it here and
 * editing the circle there read and write one groove. A loading placeholder
 * while the song's groove is not known — "off" would be a claim about the song.
 */
export function GrooveSwitch() {
  const song = useLibrarySong();
  const groove = useGroove();
  // Only a library song's groove persists: a file document shows no switch.
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
  const { enabled, commit, ...fields } = groove.data;
  return (
    <Switch
      checked={enabled}
      onCheckedChange={(on) => commit(fields, on)}
      aria-label="Groove — play the chords with a left/right-hand rhythm"
    />
  );
}
