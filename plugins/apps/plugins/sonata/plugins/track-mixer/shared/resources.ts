import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";
import { TrackViewRowSchema } from "../core";

export type { TrackViewRow } from "../core";

/**
 * ONE song's persisted track-view overrides — every `sonata_track_view` row of
 * `{ songId }`, pushed whole when any of them changes. A value, not a
 * collection: the table's key is the composite `(songId, trackId)`, so there is
 * no single id a `:rows` read could key on; one song holds at most one row per
 * track (the server states that bound — `unbounded: { reason }`). The row
 * schema + type live in `core/` (single source of truth, shared with the server
 * entity). Read by the track-mixer's observer for the open song, which
 * publishes it into the shell's track-view store; its `{ songId }` tuple is
 * also the send lane every track-view write for that song departs on.
 */
export const trackViews = liveValue("sonata-track-view", {
  schema: z.array(TrackViewRowSchema),
  params: ["songId"],
});
