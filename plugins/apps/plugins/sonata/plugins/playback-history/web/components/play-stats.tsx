import { MdPlayArrow } from "react-icons/md";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";
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
    <Frame
      gap="xs"
      className="text-2xs text-muted-foreground"
      leading={<MdPlayArrow className="size-3" />}
      content={
        <Stack direction="row" align="center" gap="xs">
          <span className="tabular-nums">
            {playCount} {playCount === 1 ? "play" : "plays"}
          </span>
          {history?.lastPlayedAt ? (
            <>
              <span aria-hidden>·</span>
              <TruncatingText>
                {formatRelativeTime(new Date(history.lastPlayedAt))}
              </TruncatingText>
            </>
          ) : null}
        </Stack>
      }
    />
  );
}
