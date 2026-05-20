import { z } from "zod";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import {
  createTask,
  getConversation,
  getTask,
  getTaskDependencyIds,
} from "@plugins/tasks-core/server";
import { withNotifyBatch } from "@plugins/framework/plugins/server-core/core";
import { armTaskAutoStart } from "./arm-auto-start";
import { rewireDependencies } from "./rewire-dependencies";

export const addTaskTool = Mcp.tool({
  name: "add_task",
  description: `Add a task to the Singularity task tree.

Task titles and descriptions should state the PROBLEM or ISSUE to solve —
not instructions on how to solve it, and no hints or suggestions either.
The agent that picks up the task will design and plan the solution itself.
Good: "Login button unresponsive on mobile". Bad: "Fix login button by
adding a touchstart handler in auth.tsx".

## relation

Controls how the new task connects to the target:

- \`followup\` (default): the new task depends on the target AND the
  target's existing dependents are rewired to wait on the new task instead.
  This inserts the new task into the chain: anything that was waiting on
  the target now waits on the new task. Use for "next step" decomposition.

- \`prerequisite\`: the target depends on the new task AND the target's
  existing dependencies transfer to the new task. The new task inherits
  the target's upstream position. Use when you discover something must
  happen before the current work.

## Examples

**Follow-up (the common case):**

  { "title": "Add dark mode support", "description": "... Plan first.", "autostart": "opus" }

**Linear chain** — use \`target\` to chain off the previous task:

  { "title": "Step 1", "autostart": "opus" }              → id: "X1"
  { "title": "Step 2", "target": "X1", "autostart": "opus" }  → id: "X2"
  { "title": "Step 3", "target": "X2", "autostart": "opus" }  → id: "X3"

If B was waiting on A, the chain auto-rewires: B → X3 → X2 → X1 → A.

**Prerequisite** — insert before the current task:

  { "title": "Write design doc", "relation": "prerequisite", "autostart": "opus" }

A now depends on the new task. A's old deps are rewired to the new task.

## Guidelines

Prefer **linear chains** over fan-out. Each downstream task picks up cold
from the prior task's outcome, and intermediate work frequently surfaces
issues that should reshape what comes after — a linear chain lets the next
agent see the actual outcome instead of executing a stale plan.`,
  inputSchema: {
    title: z.string().min(1).describe("Short title for the task."),
    description: z
      .string()
      .optional()
      .describe(
        "Optional longer description of the problem or issue. Describe WHAT is wrong or needed, not HOW to fix it. " +
        "End with \"Plan first.\" to instruct the executing agent to write its own plan before implementing — " +
        "do this for any non-mechanical task, even if a broader plan already exists."
      ),
    relation: z
      .enum(["followup", "prerequisite"])
      .default("followup")
      .describe(
        "`followup` (default): new task depends on target, target's dependents rewired. " +
        "`prerequisite`: target depends on new task, target's deps transfer."
      ),
    target: z
      .string()
      .optional()
      .describe(
        "Task ID to relate to. Defaults to the current conversation's task. " +
        "Use a previous call's task_id to chain follow-ups linearly."
      ),
    autostart: z
      .enum(["sonnet", "opus"])
      .default("opus")
      .describe(
        "Auto-launch model. Defaults to \"opus\". Use \"sonnet\" only for purely mechanical " +
        "refactoring (no design decisions, no unknowns)."
      ),
  },
  async handler(
    { title, description, relation, target, autostart },
    { conversationId },
  ) {
    const conv = await getConversation(conversationId);
    if (!conv) throw new Error(`Unknown conversation "${conversationId}"`);
    const currentTaskId = conv.taskId;

    const targetId = target ?? currentTaskId;
    const targetTask = await getTask(targetId);
    if (!targetTask) throw new Error(`Target task "${targetId}" not found`);

    const task = await createTask({
      parentId: currentTaskId,
      groupId: currentTaskId,
      title,
      description: description ?? null,
      author: conversationId,
    });

    await withNotifyBatch(() =>
      rewireDependencies({ newTaskId: task.id, targetId, relation }),
    );

    const deps = relation === "followup" ? [targetId]
      : await getTaskDependencyIds(task.id);
    await armTaskAutoStart({ taskId: task.id, model: autostart, dependencies: deps });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            task_id: task.id,
            relation,
            group_id: currentTaskId,
            autostart,
          }),
        },
      ],
    };
  },
});
