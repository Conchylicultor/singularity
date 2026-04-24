import { desc } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import { _crashes } from "./tables";

export const crashesResource = defineResource({
  key: "crashes",
  mode: "push",
  loader: async () =>
    db.select().from(_crashes).orderBy(desc(_crashes.lastSeenAt)),
});
