import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  PlaybackHistoryRowSchema,
  playbackHistoryResource,
  type PlaybackHistoryRow,
} from "../../shared/resources";
import { _songPlaybackExt } from "./tables";

export const playbackHistoryLiveResource = defineResource<PlaybackHistoryRow[]>({
  key: playbackHistoryResource.key,
  mode: "push",
  schema: z.array(PlaybackHistoryRowSchema),
  loader: async (): Promise<PlaybackHistoryRow[]> => {
    const rows = await db.select().from(_songPlaybackExt);
    return rows.map((r) => ({
      songId: r.parentId,
      playCount: r.playCount,
      lastPlayedAt: r.lastPlayedAt ? r.lastPlayedAt.toISOString() : null,
    }));
  },
});
