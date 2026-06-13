import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _reports } from "./tables";
import { ReportSchema } from "../../core/resources";

export const reportsResource = defineResource({
  key: "reports",
  mode: "push",
  schema: z.array(ReportSchema),
  loader: async () =>
    db.select().from(_reports).orderBy(desc(_reports.lastSeenAt)),
});
