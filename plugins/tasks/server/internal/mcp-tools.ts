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
  description:
    "Add a child task under the current conversation's task in the Singularity task tree.",
  inputSchema: {
    title: z.string().min(1).describe("Short title for the task."),
    description: z
      .string()
      .optional()
      .describe("Optional longer description."),
  },
  async handler({ title, description }, { conversationId }) {
    const [conv] = await db
      .select({ taskId: conversations.taskId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conv) {
      throw new Error(`Unknown conversation "${conversationId}"`);
    }

    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rank = await nextRankUnder(conv.taskId);
    await db.insert(_tasks).values({
      id,
      parentId: conv.taskId,
      title,
      description: description ?? null,
      author: conversationId,
      rank,
    });
    tasksResource.notify();

    return {
      content: [
        { type: "text", text: `Created task ${id} under ${conv.taskId}.` },
      ],
    };
  },
});
