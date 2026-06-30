import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  TransposeRowSchema,
  transposeResource,
  type TransposeRow,
} from "../../shared/resources";
import { _songTransposeExt } from "./tables";

export const transposeLiveResource = defineResource<TransposeRow[]>({
  key: transposeResource.key,
  mode: "push",
  schema: z.array(TransposeRowSchema),
  loader: async (): Promise<TransposeRow[]> => {
    const rows = await db.select().from(_songTransposeExt);
    return rows.map((r) => ({ songId: r.parentId, semitones: r.semitones }));
  },
});
