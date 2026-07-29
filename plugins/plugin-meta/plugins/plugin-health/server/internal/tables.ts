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

// Which tasks belong to a review. The `review_id` index serves the only read
// keyed on a foreign column — `handleGetTasksForReview` (see ./routes.ts),
// `WHERE review_id = X` joined to `_tasks` on `parent_id`; the pk's implicit
// btree covers the join side, not the filter.
export const healthReviewExt = defineExtension(
  _tasks,
  "health_review",
  {
    reviewId: text("review_id").notNull(),
  },
  {
    indexes: (t, b) => [b.index("review_id").on(t.reviewId)],
  },
);
export const _tasksExtHealthReview = healthReviewExt.table;
