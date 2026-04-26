import { asc } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import { _yakShavingNodes } from "./tables";
import type { YakShavingNode } from "./schema";

export const yakShavingNodesResource = defineResource({
  key: "yak-shaving-nodes",
  mode: "push",
  loader: async (): Promise<YakShavingNode[]> =>
    db
      .select()
      .from(_yakShavingNodes)
      .orderBy(asc(_yakShavingNodes.rank), asc(_yakShavingNodes.createdAt)),
});
