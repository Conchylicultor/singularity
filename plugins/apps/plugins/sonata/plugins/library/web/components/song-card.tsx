import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdDelete, MdMusicNote, MdPlayArrow } from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
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
      className="group relative flex flex-col gap-md rounded-lg p-lg"
    >
      <div className="flex items-start gap-md">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MdMusicNote className="size-5" />
        </div>
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
        <Text variant="caption" tone="muted" className="flex items-center gap-sm">
          <span className="tabular-nums">{formatDuration(song.durationSec)}</span>
        </Text>
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <MdPlayArrow className="size-4" />
        </span>
      </div>

      {/* Per-card metadata contributed by other plugins (e.g. play stats). */}
      <Library.CardMeta.Render>
        {(m) => <m.component key={m.id} song={song} />}
      </Library.CardMeta.Render>

      <button
        type="button"
        aria-label={`Delete ${song.title}`}
        className={cn(
          "absolute right-2 top-2 flex size-7 items-center justify-center rounded-md",
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
        <MdDelete className="size-4" />
      </button>
    </Card>
  );
}
