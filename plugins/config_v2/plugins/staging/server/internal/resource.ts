import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  StagedConfigDefaultSchema,
  type StagedConfigDefault,
} from "../../shared/resources";
import { _stagedConfigDefault } from "./tables";

export const stagedConfigDefaultsResource = defineResource({
  key: "config-v2-staged-defaults",
  mode: "push",
  schema: z.array(StagedConfigDefaultSchema),
  loader: async (): Promise<StagedConfigDefault[]> => {
    const rows = await db
      .select()
      .from(_stagedConfigDefault)
      .orderBy(asc(_stagedConfigDefault.pluginId), asc(_stagedConfigDefault.configName));
    return rows.map((r) => ({
      pluginId: r.pluginId,
      configName: r.configName,
      // Loosely typed at this layer; canonical validation runs at apply time.
      value: r.value as unknown,
      authorId: r.authorId,
      updatedAt: r.updatedAt,
    }));
  },
});
