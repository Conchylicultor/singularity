import { z } from "zod";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import {
  createTask,
  addTaskDependency,
  getConversation,
} from "@plugins/tasks-core/server";
import { armTaskAutoStart } from "./arm-auto-start";

export const addTaskTool = Mcp.tool({
  name: "add_task",
  description: `Add a task to the Singularity task tree.

Task titles and descriptions should state the PROBLEM or ISSUE to solve —
not instructions on how to solve it, and no hints or suggestions either.
The agent that picks up the task will design and plan the solution itself.
Good: "Login button unresponsive on mobile". Bad: "Fix login button by
adding a touchstart handler in auth.tsx".

\`parent\` places the task in the tree (containment / hierarchy). By default
the new task is created as a child of the current conversation's task.

\`dependencies\` is the orthogonal blocking relationship: a list of task IDs
that must finish (reach \`done\` or \`dropped\`) before this task can proceed.
A task with any non-terminal dependency is shown as \`blocked\` and is not
active. Use \`dependencies\` when one task must wait on others — don't
encode that by nesting.

Prefer **linear chains** over fan-out. Each downstream task picks up cold
from the prior task's outcome, and intermediate work frequently surfaces
issues that should reshape what comes after — a linear chain lets the next
agent see the actual outcome instead of executing a stale plan. Branch
only when the steps are genuinely independent.

**Follow-up tasks (the default case):** any task you create as a next
step should ALWAYS have both fields set:
- \`dependencies: ["current"]\` — blocks the task until your conversation
  is reviewed and marked done. This is mandatory for every follow-up;
  omitting it means the task races ahead before the user has seen your
  work.
- \`autoStart\` — queue it to launch automatically once unblocked. Pick
  the model by task nature: \`opus\` for new features or anything that
  requires design/planning; \`sonnet\` for mechanical refactoring,
  well-scoped fixes, and routine execution.

Chain subsequent follow-ups off the *first* follow-up's task ID, not off
\`"current"\`, so the chain stays linear.

Do NOT create a meta "holder" task to group follow-ups under. Every task
gets executed — a holder would just auto-launch an empty agent with
nothing to do. Chain follow-ups linearly off the current task instead of
inventing a parent for them.

The response always includes the new task's \`task_id\` so it can be passed
as the \`parent\` or a \`dependencies\` entry of subsequent tasks.`,
  inputSchema: {
    title: z.string().min(1).describe("Short title for the task."),
    description: z
      .string()
      .optional()
      .describe(
        "Optional longer description of the problem or issue. Describe WHAT is wrong or needed, not HOW to fix it — this includes hints, suggestions, or partial approaches. The assigned agent will design the solution. If a relevant design doc exists, cross-link it here (e.g. 'See design doc: docs/path/to/design.md')."
      ),
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
        "Task IDs this task depends on (blocking). The new task is 'blocked' until each one is 'done' or 'dropped'. Use the literal string \"current\" to depend on the task the calling agent is running in — useful when scheduling follow-up work that should wait until your current conversation finishes."
      ),
    autoStart: z
      .object({
        model: z
          .enum(["sonnet", "opus"])
          .describe(
            "Model to use when the auto-launched conversation starts. Use \"opus\" for new features or tasks that require design/planning; \"sonnet\" for mechanical refactoring, well-scoped fixes, and routine execution."
          ),
      })
      .optional()
      .describe(
        "Queue the task for auto-launch once all dependencies are non-blocking. Set this for every follow-up task — omit only when you explicitly want the task to sit in the user's queue without auto-launching."
      ),
  },
  async handler(
    { title, description, parent, dependencies, autoStart },
    { conversationId },
  ) {
    const conv = await getConversation(conversationId);
    if (!conv) throw new Error(`Unknown conversation "${conversationId}"`);
    const currentTaskId = conv.taskId;

    const parentId = parent ?? currentTaskId;

    const task = await createTask({
      parentId,
      title,
      description: description ?? null,
      author: conversationId,
    });

    const depIds = Array.from(new Set(dependencies ?? []))
      .map((d) => (d === "current" ? currentTaskId : d))
      .filter((d) => d !== "" && d !== task.id);
    for (const depId of depIds) {
      try {
        await addTaskDependency(task.id, depId);
      } catch (err) {
        throw new Error(
          `Failed to add dependency "${depId}": ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (autoStart) {
      await armTaskAutoStart({
        taskId: task.id,
        model: autoStart.model,
        dependencies: depIds,
      });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            task_id: task.id,
            parent_id: parentId,
            dependencies: depIds,
            auto_start: autoStart ? { model: autoStart.model } : null,
          }),
        },
      ],
    };
  },
});
