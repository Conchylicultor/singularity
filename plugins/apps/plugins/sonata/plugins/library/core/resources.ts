import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";
import { SongSchema } from "./schemas";

/**
 * Every saved song, newest-first — the whole `sonata_songs` table as one value,
 * recomputed and pushed whole by the DB change-feed on every create / delete /
 * update of the table. No placeholder: before the first value lands the read is
 * `pending`, and the library renders DataView's loading skeleton — never the
 * empty state.
 *
 * A whole-table value, not a `liveCollection`, until Resources item 7: the
 * library DataView sorts and filters every song client-side, including the
 * side-table field-extension columns (plays, tracks, file-missing), and a
 * bounded window needs joined side-table sort/filter columns, the host rows in
 * data-view's `FieldExtensionProps`, and live-window paging in DataView. The
 * server states that bound (`unbounded: { reason }`).
 */
export const songs = liveValue("sonata-songs", {
  schema: z.array(SongSchema),
});
