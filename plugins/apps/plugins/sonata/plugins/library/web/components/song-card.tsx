import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdDelete, MdMusicNote, MdPlayArrow } from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { deleteSong } from "../../core";
import type { Song } from "../../core";
import { Library } from "../slots";

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
      className="group relative rounded-lg p-lg"
    >
      <Stack gap="md">
        <Frame
          align="start"
          gap="md"
          leading={
            <Center className="size-10 rounded-md bg-primary/10 text-primary">
              <MdMusicNote className="size-5" />
            </Center>
          }
          content={
            <div>
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
          }
        />

        <Frame
          content={
            <Text variant="caption" tone="muted">
              <span className="tabular-nums">
                {formatDuration(song.durationSec)}
              </span>
            </Text>
          }
          trailing={
            <Center
              aria-hidden
              as="span"
              className="size-7 rounded-full bg-primary/10 text-primary"
            >
              <MdPlayArrow className="size-4" />
            </Center>
          }
        />

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
            "size-7 rounded-md",
            "text-muted-foreground opacity-0 transition-opacity",
            "hover:bg-destructive/10 hover:text-destructive",
            "group-hover:opacity-100 focus-visible:opacity-100",
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
