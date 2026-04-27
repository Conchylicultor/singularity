import { asc } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import { _yakShavingCategories, _yakShavingNodes } from "./tables";
import type { YakShavingCategory, YakShavingNode } from "./schema";

export const yakShavingNodesResource = defineResource({
  key: "yak-shaving-nodes",
  mode: "push",
  loader: async (): Promise<YakShavingNode[]> =>
    db
      .select()
      .from(_yakShavingNodes)
      .orderBy(asc(_yakShavingNodes.rank), asc(_yakShavingNodes.createdAt)),
});

export const yakShavingCategoriesResource = defineResource({
  key: "yak-shaving-categories",
  mode: "push",
  loader: async (): Promise<YakShavingCategory[]> =>
    db
      .select()
      .from(_yakShavingCategories)
      .orderBy(asc(_yakShavingCategories.rank), asc(_yakShavingCategories.createdAt)),
});
