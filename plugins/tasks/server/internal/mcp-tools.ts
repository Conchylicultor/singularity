import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { Mcp } from "@plugins/mcp/server/api";
import { db } from "../../../../server/src/db/client";
import { conversations } from "@plugins/conversations/server/schema";
import { _taskDependencies, _tasks } from "../schema_internal";
import { nextRankUnder } from "./rank";
import { tasksResource } from "./resources";

Mcp.registerTool({
  name: "add_task",
  description: `Add a task to the Singularity task tree.

\`parent\` places the task in the tree (containment / hierarchy). By default
the new task is created as a child of the current conversation's task.

\`dependencies\` is the orthogonal blocking relationship: a list of task IDs
that must finish (reach \`done\` or \`dropped\`) before this task can proceed.
A task with any non-terminal dependency is shown as \`blocked\` and is not
active. Use \`dependencies\` when one task must wait on others — don't
encode that by nesting.

The response always includes the new task's \`task_id\` so it can be passed
as the \`parent\` or a \`dependencies\` entry of subsequent tasks.`,
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
        "ID of the parent task (containment). Defaults to the current conversation's task."
      ),
    dependencies: z
      .array(z.string())
      .optional()
      .describe(
        "Task IDs this task depends on (blocking). The new task is 'blocked' until each one is 'done' or 'dropped'."
      ),
  },
  async handler({ title, description, parent, dependencies }, { conversationId }) {
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

    const depIds = Array.from(new Set(dependencies ?? [])).filter(
      (d) => d !== "" && d !== parent,
    );
    if (depIds.length > 0) {
      const found = await db
        .select({ id: _tasks.id })
        .from(_tasks)
        .where(inArray(_tasks.id, depIds));
      const foundSet = new Set(found.map((r) => r.id));
      const missing = depIds.filter((d) => !foundSet.has(d));
      if (missing.length > 0) {
        throw new Error(`Unknown dependency task id(s): ${missing.join(", ")}`);
      }
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
    if (depIds.length > 0) {
      await db
        .insert(_taskDependencies)
        .values(depIds.map((depId) => ({ taskId: id, dependsOnTaskId: depId })))
        .onConflictDoNothing();
    }
    tasksResource.notify();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            task_id: id,
            parent_id: parentId,
            dependencies: depIds,
          }),
        },
      ],
    };
  },
});
