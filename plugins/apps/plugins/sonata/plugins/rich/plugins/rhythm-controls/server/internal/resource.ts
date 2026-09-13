import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { rhythmResource, type RhythmRow } from "../../shared/resources";
import { songRhythm } from "./tables";

export const rhythmLiveResource = defineResource<RhythmRow[]>({
  key: rhythmResource.key,
  mode: "push",
  schema: z.array(songRhythm.schema),
  loader: () => db.select(songRhythm.wireColumns).from(songRhythm.table),
});
