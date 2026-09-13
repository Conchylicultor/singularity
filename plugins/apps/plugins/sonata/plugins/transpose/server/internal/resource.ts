import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { transposeResource, type TransposeRow } from "../../shared/resources";
import { songTranspose } from "./tables";

export const transposeLiveResource = defineResource<TransposeRow[]>({
  key: transposeResource.key,
  mode: "push",
  schema: z.array(songTranspose.schema),
  loader: () => db.select(songTranspose.wireColumns).from(songTranspose.table),
});
