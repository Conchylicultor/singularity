import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { hoverRevealGroup, hoverRevealTarget } from "@plugins/primitives/plugins/hover-reveal/web";
import { MdDelete, MdMusicNote, MdPause, MdPlayArrow } from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { deleteSong } from "../../core";
import type { Song } from "../../core";
import { Library } from "../slots";
import { useSonataPlayback } from "../use-playback";

/** Format a duration in seconds as `m:ss`. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * One library card. Clicking the card (or its play affordance) opens the song
 * in the player; the delete control appears on hover. Both the card and the
 * delete button are focusable for keyboard users.
 */
export function SongCard({
  song,
  onOpen,
}: {
  song: Song;
  onOpen: (song: Song) => void;
}) {
  const { mutate: deleteSongMutation } = useEndpointMutation(deleteSong);
  const { togglePlaySong, currentSongId, isPlaying } = useSonataPlayback();
  const isCurrent = currentSongId === song.id;
  const isThisPlaying = isCurrent && isPlaying;
  return (
    <Card
      interactive
      role="button"
      tabIndex={0}
      onClick={() => onOpen(song)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(song);
        }
      }}
      className={cn(
        hoverRevealGroup,
        "relative rounded-lg p-lg",
        isThisPlaying && "ring-2 ring-primary",
      )}
    >
      <Stack gap="md">
        <div className="flex items-start gap-md">
          <Center className="size-10 rounded-md bg-primary/10 text-primary">
            <MdMusicNote className="size-5" />
          </Center>
          <div className="min-w-0 flex-1">
            <Text
              as="div"
              variant="body"
              className="truncate font-semibold text-foreground"
            >
              {song.title}
            </Text>
            <Text as="div" variant="caption" tone="muted" className="truncate">
              {song.composer ?? "Unknown"}
            </Text>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Text variant="caption" tone="muted">
            <span className="tabular-nums">
              {formatDuration(song.durationSec)}
            </span>
          </Text>
          <button
            type="button"
            aria-label={isThisPlaying ? `Pause ${song.title}` : `Play ${song.title}`}
            onClick={(e) => {
              e.stopPropagation();
              togglePlaySong(song);
            }}
            className={cn(
              "size-7 rounded-full transition-colors",
              isCurrent
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            <Center className="size-full">
              {isThisPlaying ? (
                <MdPause className="size-4" />
              ) : (
                <MdPlayArrow className="size-4" />
              )}
            </Center>
          </button>
        </div>

        {/* Per-card metadata contributed by other plugins (e.g. play stats). */}
        <Library.CardMeta.Render>
          {(m) => <m.component key={m.id} song={song} />}
        </Library.CardMeta.Render>
      </Stack>

      <Pin to="top-right" offset="xs">
        <button
          type="button"
          aria-label={`Delete ${song.title}`}
          className={cn(
            hoverRevealTarget,
            "size-7 rounded-md",
            "text-muted-foreground",
            "hover:bg-destructive/10 hover:text-destructive",
            "focus-visible:opacity-100",
          )}
          onClick={(e) => {
            // Don't let the delete bubble up and open the song.
            e.stopPropagation();
            deleteSongMutation({ params: { id: song.id } });
          }}
        >
          <Center className="size-full">
            <MdDelete className="size-4" />
          </Center>
        </button>
      </Pin>
    </Card>
  );
}
