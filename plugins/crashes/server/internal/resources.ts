import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _crashes } from "./tables";
import { CrashSchema } from "../../core/resources";

export const crashesResource = defineResource({
  key: "crashes",
  mode: "push",
  schema: z.array(CrashSchema),
  loader: async () =>
    db.select().from(_crashes).orderBy(desc(_crashes.lastSeenAt)),
});
