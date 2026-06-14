import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  KeyAutoDetectRowSchema,
  keyAutoDetectResource,
  type KeyAutoDetectRow,
} from "../../shared/resources";
import { _songKeyAutoDetectExt } from "./tables";

export const keyAutoDetectLiveResource = defineResource<KeyAutoDetectRow[]>({
  key: keyAutoDetectResource.key,
  mode: "push",
  schema: z.array(KeyAutoDetectRowSchema),
  loader: async (): Promise<KeyAutoDetectRow[]> => {
    const rows = await db.select().from(_songKeyAutoDetectExt);
    return rows.map((r) => ({ songId: r.parentId, enabled: r.enabled }));
  },
});
