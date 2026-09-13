import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  playbackHistoryResource,
  type PlaybackHistoryRow,
} from "../../shared/resources";
import { songPlayback } from "./tables";

export const playbackHistoryLiveResource = defineResource<PlaybackHistoryRow[]>(
  {
    key: playbackHistoryResource.key,
    mode: "push",
    schema: z.array(songPlayback.schema),
    loader: () => db.select(songPlayback.wireColumns).from(songPlayback.table),
  },
);
