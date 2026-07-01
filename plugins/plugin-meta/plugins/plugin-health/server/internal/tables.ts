import { text, uniqueIndex } from "drizzle-orm/pg-core";
import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { defineEntity, defaultNow } from "@plugins/infra/plugins/entities/server";
import { pluginHealthReviewFields } from "../../core";

// The table + the `PluginHealthReview` wire schema both derive from the single
// `pluginHealthReviewFields` record (core), so a column/schema drift is
// unrepresentable and the loader drops its projection.
const pluginHealthReviews = defineEntity(
  "plugin_health_reviews",
  pluginHealthReviewFields,
  {
    primaryKey: "id",
    columns: {
      createdAt: { default: defaultNow() },
    },
    indexes: (t) => [
      uniqueIndex("plugin_health_reviews_plugin_axis_idx").on(
        t.pluginId,
        t.axis,
      ),
    ],
  },
);

// drizzle-kit schema-glob discovery. Name kept so consumers don't churn.
export const _pluginHealthReviews = pluginHealthReviews.table;

export const healthReviewExt = defineExtension(_tasks, "health_review", {
  reviewId: text("review_id").notNull(),
});
export const _tasksExtHealthReview = healthReviewExt.table;
