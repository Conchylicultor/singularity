import { z } from "zod";
import { db } from "@plugins/database/server";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import { createTask, getConversation } from "@plugins/tasks-core/server";
import { inheritTaskPreprompt } from "@plugins/tasks/plugins/task-preprompt/server";
import { _pluginHealthReviews, healthReviewExt } from "./tables";
import { pluginHealthReviewsResource } from "./resource";

export const proposeTaskTool = Mcp.tool({
  name: "propose_task",
  description: `Propose a task for a plugin along a review axis.

Each call creates a draft task linked to a review context. The review row
(pluginId × axis) is created on the first call and updated on subsequent
calls for the same pair. The user accepts or rejects proposed tasks; accepted
ones flow through the normal task system.

Task titles should state the PROBLEM — not instructions on how to fix it.
Good: "Floating promise in sidebar refresh". Bad: "Add await to line 42".`,
  inputSchema: {
    pluginId: z
      .string()
      .min(1)
      .describe(
        "Plugin hierarchy ID, e.g. 'tasks' or 'conversations.conversation-view'.",
      ),
    axis: z
      .string()
      .min(1)
      .describe(
        "Review dimension, e.g. 'security', 'promise-safety', 'ui-polish'.",
      ),
    commitHash: z
      .string()
      .min(1)
      .describe("Git HEAD commit hash at time of review."),
    title: z.string().min(1).describe("Short title describing the problem."),
    description: z
      .string()
      .optional()
      .describe("Longer description of the problem or issue."),
  },
  async handler(
    { pluginId, axis, commitHash, title, description },
    { conversationId },
  ) {
    const conv = await getConversation(conversationId);
    const currentTaskId = conv?.taskId ?? null;

    const reviewId = `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [review] = await db
      .insert(_pluginHealthReviews)
      .values({
        id: reviewId,
        pluginId,
        axis,
        commitHash,
        conversationId,
      })
      .onConflictDoUpdate({
        target: [_pluginHealthReviews.pluginId, _pluginHealthReviews.axis],
        set: {
          commitHash,
          conversationId,
          createdAt: new Date(),
        },
      })
      .returning();

    const task = await createTask({
      folderId: currentTaskId,
      title,
      description: description ?? null,
      author: conversationId,
    });

    await healthReviewExt.upsert(task.id, { reviewId: review!.id });

    // Inherit the spawning agent's system prompt onto the proposed task, so it
    // launches under the same instructions once accepted.
    if (currentTaskId) await inheritTaskPreprompt(currentTaskId, task.id);

    pluginHealthReviewsResource.notify();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            review_id: review!.id,
            task_id: task.id,
          }),
        },
      ],
    };
  },
});
