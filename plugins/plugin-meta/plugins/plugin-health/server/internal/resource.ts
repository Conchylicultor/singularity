import { z } from "zod";
import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  PluginHealthReviewSchema,
  type PluginHealthReview,
} from "../../core";
import { _pluginHealthReviews } from "./tables";

export const pluginHealthReviewsResource = defineResource({
  key: "plugin-health-reviews",
  mode: "push",
  schema: z.array(PluginHealthReviewSchema),
  loader: async (): Promise<PluginHealthReview[]> => {
    const rows = await db
      .select()
      .from(_pluginHealthReviews)
      .orderBy(
        asc(_pluginHealthReviews.pluginId),
        asc(_pluginHealthReviews.axis),
      );
    return rows.map((r) => ({
      id: r.id,
      pluginId: r.pluginId,
      axis: r.axis,
      commitHash: r.commitHash,
      conversationId: r.conversationId,
      createdAt: r.createdAt.toISOString(),
    }));
  },
});
