import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  playbackHistoryResource,
  type PlaybackHistoryRow,
} from "../shared/resources";

/** All playback rollups indexed by song id (for sorting / batch lookup). */
export function usePlaybackHistoryMap(): Map<string, PlaybackHistoryRow> {
  const result = useResource(playbackHistoryResource);
  // Empty map while pending is genuinely correct: sort-order consumers treat a
  // missing entry as "never played" (count=0, last-played=epoch 0), the same
  // stable default they apply to unplayed songs at any point. Sort order is
  // deterministic before and after the resource settles.
  return useMemo(() => {
    if (result.pending) return new Map<string, PlaybackHistoryRow>();
    return new Map(result.data.map((r) => [r.songId, r]));
  }, [result]);
}

/** One song's playback rollup, or null if it has never been played. */
export function usePlaybackHistory(
  songId: string | null | undefined,
): PlaybackHistoryRow | null {
  const result = useResource(playbackHistoryResource);
  if (!songId) return null;
  if (result.pending) return null;
  return result.data.find((r) => r.songId === songId) ?? null;
}
