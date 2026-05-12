import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _tasks } from "@plugins/tasks-core/server";
import { _pluginHealthReviews, healthReviewExt } from "./tables";
import {
  pluginIdToPath,
  commitsSince,
  apiChangedSince,
} from "./staleness";

export async function handleGetReviews(): Promise<Response> {
  const rows = await db.select().from(_pluginHealthReviews);
  return Response.json(
    rows.map((r) => ({
      id: r.id,
      pluginId: r.pluginId,
      axis: r.axis,
      commitHash: r.commitHash,
      conversationId: r.conversationId,
      createdAt: r.createdAt.toISOString(),
    })),
  );
}

export async function handleGetStaleness(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const pluginId = params.pluginId!;
  const reviews = await db
    .select()
    .from(_pluginHealthReviews)
    .where(eq(_pluginHealthReviews.pluginId, pluginId));

  const pluginPath = pluginIdToPath(pluginId);
  const results = await Promise.all(
    reviews.map(async (r) => ({
      axis: r.axis,
      commitsSince: await commitsSince(r.commitHash, pluginPath),
      apiChanged: await apiChangedSince(r.commitHash, pluginPath),
    })),
  );

  return Response.json(results);
}

export async function handleGetTasksForReview(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const reviewId = params.reviewId!;
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

  return Response.json(
    rows.map((r) => ({
      taskId: r.taskId,
      title: r.title,
      status: r.droppedAt ? "dropped" : r.heldAt ? "held" : "open",
    })),
  );
}
