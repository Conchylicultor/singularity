import { eq } from "drizzle-orm";
import { z } from "zod";
import { Mcp } from "@plugins/mcp/server/api";
import { db } from "../../../../server/src/db/client";
import { conversations } from "@plugins/conversations/server/schema";
import { _tasks } from "../schema_internal";
import { nextRankUnder } from "./rank";
import { tasksResource } from "./resources";

Mcp.registerTool({
  name: "add_task",
  description: `Add a task to the Singularity task tree.

By default the task is created as a child of the current conversation's task.
Pass \`parent\` to place it under a specific task instead — useful for building
dependency chains: create a parent task first, capture its returned \`task_id\`,
then create child tasks with \`parent\` set to that id.

The response always includes the new task's \`task_id\` so it can be passed as
the \`parent\` of subsequent tasks.`,
  inputSchema: {
    title: z.string().min(1).describe("Short title for the task."),
    description: z
      .string()
      .optional()
      .describe("Optional longer description."),
    parent: z
      .string()
      .optional()
      .describe(
        "ID of the parent task. Defaults to the current conversation's task. Pass a task_id returned by a previous add_task call to nest tasks and express dependencies."
      ),
  },
  async handler({ title, description, parent }, { conversationId }) {
    let parentId: string;

    if (parent) {
      parentId = parent;
    } else {
      const [conv] = await db
        .select({ taskId: conversations.taskId })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      if (!conv) {
        throw new Error(`Unknown conversation "${conversationId}"`);
      }
      parentId = conv.taskId;
    }

    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rank = await nextRankUnder(parentId);
    await db.insert(_tasks).values({
      id,
      parentId,
      title,
      description: description ?? null,
      author: conversationId,
      rank,
    });
    tasksResource.notify();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ task_id: id, parent_id: parentId }),
        },
      ],
    };
  },
});
