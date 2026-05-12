import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { _tasks } from "@plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

export const _pluginHealthReviews = pgTable(
  "plugin_health_reviews",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id").notNull(),
    axis: text("axis").notNull(),
    commitHash: text("commit_hash").notNull(),
    conversationId: text("conversation_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("plugin_health_reviews_plugin_axis_idx").on(
      t.pluginId,
      t.axis,
    ),
  ],
);

export const healthReviewExt = defineExtension(_tasks, "health_review", {
  reviewId: text("review_id").notNull(),
});
export const _tasksExtHealthReview = healthReviewExt.table;
