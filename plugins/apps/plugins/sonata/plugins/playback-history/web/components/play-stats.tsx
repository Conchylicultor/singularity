import { MdPlayArrow } from "react-icons/md";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { Song } from "@plugins/apps/plugins/sonata/plugins/library/core";
import { usePlaybackHistory } from "../hooks";

/** Per-card play stats, contributed to the library's `CardMeta` slot. */
export function PlayStats({ song }: { song: Song }) {
  const history = usePlaybackHistory(song.id);
  const playCount = history?.playCount ?? 0;

  if (playCount === 0) {
    return <div className="text-2xs text-muted-foreground">Not played yet</div>;
  }

  return (
    <div className="flex items-center gap-xs text-2xs text-muted-foreground">
      <MdPlayArrow className="size-3 shrink-0" />
      <span className="tabular-nums">
        {playCount} {playCount === 1 ? "play" : "plays"}
      </span>
      {history?.lastPlayedAt ? (
        <>
          <span aria-hidden>·</span>
          <Text>
            {formatRelativeTime(new Date(history.lastPlayedAt))}
          </Text>
        </>
      ) : null}
    </div>
  );
}
