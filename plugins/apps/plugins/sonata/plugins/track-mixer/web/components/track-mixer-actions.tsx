import { MdRestartAlt } from "react-icons/md";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { resetTrackViews } from "../actions";
import { useTrackMixerEntries } from "../hooks";

/**
 * Header-right action for the "Tracks" `Sonata.Section` (contributed as
 * `actions`). Resets every track's persisted view overrides (color / instrument
 * / mute / hide) back to defaults; disabled when nothing is customized. The host
 * (SectionCard) renders this in the card header, so it stays reachable while the
 * card is collapsed — the reason the reset lives here rather than in the panel
 * body. Renders nothing when no song is open. No `ControlSizeProvider` here: the
 * SectionCard already renders `actions` at `sm` control density.
 */
export function TrackMixerActions() {
  const { currentSongId } = useSonata();
  const entries = useTrackMixerEntries();
  if (!currentSongId) return null;
  const anyCustomized = entries.some((e) => e.customized);
  return (
    <IconButton
      icon={MdRestartAlt}
      label="Reset tracks to defaults"
      disabled={!anyCustomized}
      onClick={() => resetTrackViews(currentSongId)}
    />
  );
}
