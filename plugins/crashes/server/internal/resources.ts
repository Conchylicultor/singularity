import { desc } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { defineResource } from "../../../../server/src/resources";
import { _crashes } from "./tables";

export const crashesResource = defineResource({
  key: "crashes",
  mode: "push",
  loader: async () =>
    db.select().from(_crashes).orderBy(desc(_crashes.lastSeenAt)),
});
