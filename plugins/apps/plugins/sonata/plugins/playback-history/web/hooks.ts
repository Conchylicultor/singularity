import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  playbackHistoryResource,
  type PlaybackHistoryRow,
} from "../shared/resources";

const EMPTY_ROWS: PlaybackHistoryRow[] = [];

/** All playback rollups indexed by song id (for sorting / batch lookup). */
export function usePlaybackHistoryMap(): Map<string, PlaybackHistoryRow> {
  const result = useResource(playbackHistoryResource);
  const rows = result.pending ? EMPTY_ROWS : result.data;
  return useMemo(() => new Map(rows.map((r) => [r.songId, r])), [rows]);
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
