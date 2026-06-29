import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdPause, MdPlayArrow } from "react-icons/md";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import type { Song } from "../../core";
import { useSonataPlayback } from "../use-playback";

/**
 * Trailing per-row Play/Pause action for the library table. Plays the song in
 * the background (no navigation) via the shared transport; shows Pause while the
 * row's song is the one currently playing. Click never activates the row
 * (stopPropagation), so it won't open the full player.
 */
export function PlaySongAction({ row }: ItemActionProps<Song>) {
  const { togglePlaySong, currentSongId, isPlaying } = useSonataPlayback();
  const isThisPlaying = currentSongId === row.id && isPlaying;
  return (
    <ControlSizeProvider size="sm">
      <IconButton
        icon={isThisPlaying ? MdPause : MdPlayArrow}
        label={isThisPlaying ? "Pause" : "Play"}
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          togglePlaySong({ id: row.id, title: row.title });
        }}
      />
    </ControlSizeProvider>
  );
}
