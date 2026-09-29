import { useMemo } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import { foldResource } from "@plugins/primitives/plugins/live-state/web";
import { playbackHistory, type PlaybackHistoryRow } from "../shared/resources";

/** All playback rollups indexed by song id (for sorting / batch lookup). */
export function usePlaybackHistoryMap(): Map<string, PlaybackHistoryRow> {
  const result = useLive(playbackHistory);
  // Empty map while pending is genuinely correct: sort-order consumers treat a
  // missing entry as "never played" (count=0, last-played=epoch 0), the same
  // stable default they apply to unplayed songs at any point. Sort order is
  // deterministic before and after the value settles.
  // Accepted pending collapse until Resources item 7 (joined columns on songs).
  // A failed read keeps its last-seen rows (`stale`), else the same empty map
  // (every song "never played"), and live-state reports the failure.
  return useMemo(() => {
    const index = (rows: readonly PlaybackHistoryRow[]) =>
      new Map(rows.map((r) => [r.songId, r]));
    return foldResource(result, {
      loading: () => new Map<string, PlaybackHistoryRow>(),
      error: (_error, stale) =>
        stale === undefined
          ? new Map<string, PlaybackHistoryRow>()
          : index(stale),
      ready: index,
    });
  }, [result]);
}
