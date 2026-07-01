import { eq } from "drizzle-orm";
import { asFsPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import {
  getPluginHealthReviews,
  getPluginStaleness,
  getPluginHealthTasks,
} from "../../core/endpoints";
import { _pluginHealthReviews, healthReviewExt } from "./tables";
import {
  commitsSince,
  apiChangedSince,
} from "./staleness";

export const handleGetReviews = implement(getPluginHealthReviews, async () =>
  db.select().from(_pluginHealthReviews),
);

export const handleGetStaleness = implement(getPluginStaleness, async ({ params }) => {
  const { pluginId } = params;
  const reviews = await db
    .select()
    .from(_pluginHealthReviews)
    .where(eq(_pluginHealthReviews.pluginId, pluginId));

  const pluginPath = asFsPath(asPluginId(pluginId));
  return Promise.all(
    reviews.map(async (r) => ({
      axis: r.axis,
      commitsSince: await commitsSince(r.commitHash, pluginPath),
      apiChanged: await apiChangedSince(r.commitHash, pluginPath),
    })),
  );
});

export const handleGetTasksForReview = implement(getPluginHealthTasks, async ({ params }) => {
  const { reviewId } = params;
  const rows = await db
    .select({
      taskId: healthReviewExt.table.parentId,
      reviewId: healthReviewExt.table.reviewId,
      title: _tasks.title,
      droppedAt: _tasks.droppedAt,
      heldAt: _tasks.heldAt,
    })
    .from(healthReviewExt.table)
    .innerJoin(_tasks, eq(_tasks.id, healthReviewExt.table.parentId))
    .where(eq(healthReviewExt.table.reviewId, reviewId));

  return rows.map((r) => ({
    taskId: r.taskId,
    title: r.title,
    status: r.droppedAt ? "dropped" : r.heldAt ? "held" : "open",
  }));
});
