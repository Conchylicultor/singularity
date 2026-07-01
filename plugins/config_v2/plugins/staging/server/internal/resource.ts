import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  StagedConfigDefaultSchema,
  type StagedConfigDefault,
} from "../../core/resources";
import { _stagedConfigDefault } from "./tables";

// The table row type and the `StagedConfigDefault` wire schema both derive from
// the single `stagedConfigDefaultFields` record (core), so
// `_stagedConfigDefault.$inferSelect` matches `StagedConfigDefault` by
// construction — the loader returns `db.select()` rows verbatim, no projection.
export const stagedConfigDefaultsResource = defineResource({
  key: "config-v2-staged-defaults",
  mode: "push",
  schema: z.array(StagedConfigDefaultSchema),
  loader: async (): Promise<StagedConfigDefault[]> =>
    db
      .select()
      .from(_stagedConfigDefault)
      .orderBy(asc(_stagedConfigDefault.pluginId), asc(_stagedConfigDefault.configName)),
});
