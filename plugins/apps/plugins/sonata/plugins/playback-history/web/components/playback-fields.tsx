import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import type { Song } from "@plugins/apps/plugins/sonata/plugins/library/core";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { playbackColumns } from "../../core";

/**
 * The Plays / Last played fields, read off every library row's `playback`
 * columns (`playbackColumns.read`) — the library's live collection carries
 * them, so there is no side read to wait for and nothing to stand in for while
 * it loads. Each binds its column, so the library sorts and filters by it on
 * the server: "Most played" / "Recently played" are plain config sort presets
 * over `playCount` / `lastPlayedAt`, and "Unplayed" a filter preset.
 */
const PLAYBACK_FIELDS: FieldDef<Song>[] = [
  {
    id: "playCount",
    label: "Plays",
    type: "int",
    // Wide enough for the `cell`'s longest string ("Not played yet"), not
    // just for the digits — at 5rem the unplayed case clipped mid-word.
    width: "8rem",
    align: "end",
    value: (s) => playbackColumns.read(s).playCount,
    // The copy the old per-card `PlayStats` strip owned, recovered as this
    // field's cell — so the number reads as a sentence on the card (and in
    // the table) instead of a bare `0`.
    cell: (s) => {
      const n = playbackColumns.read(s).playCount;
      return n ? `${n} ${n === 1 ? "play" : "plays"}` : "Not played yet";
    },
    sortable: true,
    column: playbackColumns.column("playCount"),
  },
  {
    id: "lastPlayedAt",
    label: "Last played",
    type: "date",
    width: "8rem",
    value: (s) => playbackColumns.read(s).lastPlayedAt,
    cell: (s) => {
      const at = playbackColumns.read(s).lastPlayedAt;
      return at ? formatRelativeTime(at) : "—";
    },
    sortable: true,
    column: playbackColumns.column("lastPlayedAt"),
  },
];

/** Field extension contributed into the library's `Library.Fields` factory. */
export function PlaybackFields({ render }: FieldExtensionProps<Song>) {
  return <>{render(PLAYBACK_FIELDS)}</>;
}
