import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import { _crashes } from "./tables";
import { CrashSchema } from "./schema";

export const crashesResource = defineResource({
  key: "crashes",
  mode: "push",
  schema: z.array(CrashSchema),
  loader: async () =>
    db.select().from(_crashes).orderBy(desc(_crashes.lastSeenAt)),
});
