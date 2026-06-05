import { useMemo } from "react";
import type { SortOrderProps } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { usePlaybackHistoryMap } from "../hooks";

/** ISO timestamp → epoch ms; never-played sorts last (0). */
function lastMs(iso: string | null | undefined): number {
  return iso ? new Date(iso).getTime() : 0;
}

/** Order by play count, descending. Contributed to the library's `Sort` slot. */
export function MostPlayedOrder({ songs, render }: SortOrderProps) {
  const map = usePlaybackHistoryMap();
  const ordered = useMemo(
    () =>
      [...songs].sort(
        (a, b) =>
          (map.get(b.id)?.playCount ?? 0) - (map.get(a.id)?.playCount ?? 0),
      ),
    [songs, map],
  );
  return <>{render(ordered)}</>;
}

/** Order by last-played, most recent first. */
export function RecentlyPlayedOrder({ songs, render }: SortOrderProps) {
  const map = usePlaybackHistoryMap();
  const ordered = useMemo(
    () =>
      [...songs].sort(
        (a, b) =>
          lastMs(map.get(b.id)?.lastPlayedAt) -
          lastMs(map.get(a.id)?.lastPlayedAt),
      ),
    [songs, map],
  );
  return <>{render(ordered)}</>;
}
