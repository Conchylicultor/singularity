import {
  getTask,
  listActiveConversations,
  type Task,
} from "@plugins/tasks-core/server";
import { readConversationTurns } from "@plugins/conversations/server";
import { db } from "@server/db/client";
import { _yakShavingNodes } from "./tables";
import { yakShavingNodesResource } from "./resources";

const FIRST_TURN_MAX_CHARS = 1000;

const PROMPT_INSTRUCTIONS = `You are rebuilding the yak-shaving tree from scratch. The tree organizes the user's active conversations into a hierarchy that captures lines of work — what the user is trying to accomplish and how conversations branch from each other.

The tree is currently empty. For each conversation listed below, call the \`mcp__singularity__yak_add_node\` MCP tool exactly once. Use the MCP tool directly — do NOT call it via Bash, curl, or any HTTP request. The tool is registered in your MCP configuration and is the only correct way to add nodes.

Identify parent-child relationships by reading task ancestry (conversations sharing a task lineage are likely related) and the first user turn (a child picks up where the parent left off, branches into a sub-question, or implements something the parent designed).

Add roots first, then add their children. \`parentConversationId\` must reference a conversation you have already added in this same turn (or null for a root).

Then stop. Do not call any other tools, do not read any files, and do not write a final assistant message — once every conversation has a node, you're done.`;

export async function clearYakTree(): Promise<void> {
  await db.delete(_yakShavingNodes);
  yakShavingNodesResource.notify();
}

export async function buildRebuildPayload(): Promise<string> {
  const convs = await listActiveConversations();
  const taskCache = new Map<string, Task | null>();

  const parts: string[] = [PROMPT_INSTRUCTIONS, "", "# Conversations", ""];

  if (convs.length === 0) {
    parts.push("(No active conversations. Nothing to add.)");
    return parts.join("\n");
  }

  for (const conv of convs) {
    const turns = await readConversationTurns(conv.id);
    const firstUserTurn = turns.find((t) => t.role === "user");
    const ancestry = await buildTaskAncestry(conv.taskId, taskCache);

    parts.push(`## ${conv.id} — "${conv.title ?? "Untitled"}"`);
    parts.push(`- Task ancestry: ${ancestry.length > 0 ? ancestry.join(" > ") : "(none)"}`);
    parts.push(`- Conversation status: ${conv.status}`);
    parts.push(`- Model: ${conv.model}`);
    parts.push(`- Spawned by: ${conv.spawnedBy ?? "user"}`);
    if (firstUserTurn) {
      const text = truncate(firstUserTurn.text.trim(), FIRST_TURN_MAX_CHARS);
      parts.push(`- First user turn:`);
      parts.push(text.split("\n").map((line) => `  > ${line}`).join("\n"));
    } else {
      parts.push(`- First user turn: (none yet)`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

async function buildTaskAncestry(
  taskId: string,
  cache: Map<string, Task | null>,
): Promise<string[]> {
  const titles: string[] = [];
  let cur: string | null = taskId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    let task = cache.get(cur);
    if (task === undefined) {
      task = await getTask(cur);
      cache.set(cur, task);
    }
    if (!task) break;
    titles.unshift(task.title);
    cur = task.parentId;
  }
  return titles;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
