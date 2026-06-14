import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  StagedReorderDefaultSchema,
  type StagedReorderDefault,
} from "../../shared/resources";
import { _reorderStagedDefault } from "./tables";

export const stagedReorderDefaultsResource = defineResource({
  key: "reorder-staged-defaults",
  mode: "push",
  schema: z.array(StagedReorderDefaultSchema),
  loader: async (): Promise<StagedReorderDefault[]> => {
    const rows = await db
      .select()
      .from(_reorderStagedDefault)
      .orderBy(asc(_reorderStagedDefault.slotId));
    return rows.map((r) => ({
      slotId: r.slotId,
      pluginId: r.pluginId,
      // Loosely typed at this layer; canonical validation runs at apply time.
      items: r.items as unknown[],
      authorId: r.authorId,
      updatedAt: r.updatedAt,
    }));
  },
});
