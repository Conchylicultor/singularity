import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  TrackViewRowSchema,
  trackViewResource,
  type TrackViewRow,
} from "../../shared/resources";
import { _trackView } from "./tables";

/** Push-mode rollup of every persisted track-view override. */
export const trackViewLiveResource = defineResource<TrackViewRow[]>({
  key: trackViewResource.key,
  mode: "push",
  schema: z.array(TrackViewRowSchema),
  loader: async (): Promise<TrackViewRow[]> => {
    const rows = await db.select().from(_trackView);
    return rows.map((r) => ({
      songId: r.songId,
      trackId: r.trackId,
      color: r.color,
      muted: r.muted,
      hidden: r.hidden,
    }));
  },
});
