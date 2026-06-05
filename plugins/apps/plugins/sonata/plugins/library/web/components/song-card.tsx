import { MdDelete, MdMusicNote, MdPlayArrow } from "react-icons/md";
import { cn } from "@/lib/utils";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
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
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-lg border border-border bg-card p-4",
        "cursor-pointer transition-colors hover:border-primary/60 hover:bg-muted/40",
      )}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(song)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(song);
        }
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MdMusicNote className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {song.title}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {song.composer ?? "Unknown"}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{formatDuration(song.durationSec)}</span>
        </span>
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
          void fetchEndpoint(deleteSong, { id: song.id });
        }}
      >
        <MdDelete className="size-4" />
      </button>
    </div>
  );
}
