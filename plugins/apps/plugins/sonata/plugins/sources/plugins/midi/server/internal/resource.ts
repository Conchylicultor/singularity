import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  SongMidiRowSchema,
  songMidiResource,
  type SongMidiRow,
} from "../../shared/resources";
import { _songMidiExt } from "./tables";

export const songMidiLiveResource = defineResource<SongMidiRow[]>({
  key: songMidiResource.key,
  mode: "push",
  schema: z.array(SongMidiRowSchema),
  loader: async (): Promise<SongMidiRow[]> => {
    const rows = await db.select().from(_songMidiExt);
    return rows.map((r) => ({
      songId: r.parentId,
      attachmentId: r.attachmentId,
      trackCount: r.trackCount,
      sourcePath: r.sourcePath,
      sourceMissing: r.sourceMissing,
    }));
  },
});
