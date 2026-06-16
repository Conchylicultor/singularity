import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { StarredPageRowSchema, type StarredPageRow } from "../../shared/resources";
import { _pageBlocksStarredExt } from "./tables";

export const starredPagesServerResource = defineResource({
  key: "pages-starred",
  mode: "push",
  schema: z.array(StarredPageRowSchema),
  loader: async (): Promise<StarredPageRow[]> => {
    const rows = await db
      .select()
      .from(_pageBlocksStarredExt)
      .orderBy(asc(_pageBlocksStarredExt.rank));
    return rows.map((r) => ({ parentId: r.parentId, rank: Rank.from(r.rank) }));
  },
});
