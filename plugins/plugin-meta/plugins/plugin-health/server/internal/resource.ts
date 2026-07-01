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
  loader: async (): Promise<PluginHealthReview[]> =>
    db
      .select()
      .from(_pluginHealthReviews)
      .orderBy(
        asc(_pluginHealthReviews.pluginId),
        asc(_pluginHealthReviews.axis),
      ),
});
