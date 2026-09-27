import { useMemo } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import { playbackHistory, type PlaybackHistoryRow } from "../shared/resources";

/** All playback rollups indexed by song id (for sorting / batch lookup). */
export function usePlaybackHistoryMap(): Map<string, PlaybackHistoryRow> {
  const result = useLive(playbackHistory);
  // Empty map while pending is genuinely correct: sort-order consumers treat a
  // missing entry as "never played" (count=0, last-played=epoch 0), the same
  // stable default they apply to unplayed songs at any point. Sort order is
  // deterministic before and after the value settles.
  // Accepted pending collapse until Resources item 7 (joined columns on songs).
  return useMemo(() => {
    if (result.pending) return new Map<string, PlaybackHistoryRow>();
    return new Map(result.data.map((r) => [r.songId, r]));
  }, [result]);
}
