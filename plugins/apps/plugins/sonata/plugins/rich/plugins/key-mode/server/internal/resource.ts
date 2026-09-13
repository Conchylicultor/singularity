import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  keyAutoDetectResource,
  type KeyAutoDetectRow,
} from "../../shared/resources";
import { songKeyAutoDetect } from "./tables";

export const keyAutoDetectLiveResource = defineResource<KeyAutoDetectRow[]>({
  key: keyAutoDetectResource.key,
  mode: "push",
  schema: z.array(songKeyAutoDetect.schema),
  loader: () =>
    db.select(songKeyAutoDetect.wireColumns).from(songKeyAutoDetect.table),
});
