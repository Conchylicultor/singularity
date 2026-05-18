import { desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { BuildRunSchema } from "../../shared";
import { _buildRuns } from "./tables";
import { z } from "zod";

export const buildHistoryResource = defineResource({
  key: "build.history",
  mode: "push",
  schema: z.array(BuildRunSchema),
  loader: async () =>
    db.select().from(_buildRuns).orderBy(desc(_buildRuns.startedAt)).limit(50),
});
