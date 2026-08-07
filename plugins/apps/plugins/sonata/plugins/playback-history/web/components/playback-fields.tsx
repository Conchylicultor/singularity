import { useMemo } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import type { Song } from "@plugins/apps/plugins/sonata/plugins/library/core";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { usePlaybackHistoryMap } from "../hooks";

/**
 * Field extension contributed into the library's `Library.Fields` factory: a
 * render-callback component that reads this plugin's own live playback rollup
 * (`usePlaybackHistoryMap`) and yields two `FieldDef<Song>` closed over the map.
 * Because the fields carry a synchronous `value` projection + `sortable`, they
 * show up in the DataView's Sort pill, Filter pill, and table columns for free —
 * so "Most played" / "Recently played" are plain config sort presets over
 * `playCount` / `lastPlayedAt`, with no bespoke toolbar chip.
 */
export function PlaybackFields({ render }: FieldExtensionProps<Song>) {
  const map = usePlaybackHistoryMap();
  const fields = useMemo<FieldDef<Song>[]>(
    () => [
      {
        id: "playCount",
        label: "Plays",
        type: "int",
        // Wide enough for the `cell`'s longest string ("Not played yet"), not
        // just for the digits — at 5rem the unplayed case clipped mid-word.
        width: "8rem",
        align: "end",
        value: (s) => map.get(s.id)?.playCount ?? 0,
        // The copy the old per-card `PlayStats` strip owned, recovered as this
        // field's cell — so the number reads as a sentence on the card (and in
        // the table) instead of a bare `0`.
        cell: (s) => {
          const n = map.get(s.id)?.playCount ?? 0;
          return n ? `${n} ${n === 1 ? "play" : "plays"}` : "Not played yet";
        },
        sortable: true,
      },
      {
        id: "lastPlayedAt",
        label: "Last played",
        type: "date",
        width: "8rem",
        value: (s) => {
          const iso = map.get(s.id)?.lastPlayedAt;
          return iso ? new Date(iso) : null;
        },
        cell: (s) => {
          const iso = map.get(s.id)?.lastPlayedAt;
          return iso ? formatRelativeTime(new Date(iso)) : "—";
        },
        sortable: true,
      },
    ],
    [map],
  );
  return <>{render(fields)}</>;
}
