import {
  getTask,
  listActiveConversations,
  type Conversation,
  type Task,
} from "@plugins/tasks-core/server";
import { readConversationTurns } from "@plugins/conversations/server";
import { db } from "@server/db/client";
import { _yakShavingNodes } from "./tables";
import type { YakShavingNode } from "./schema";

const FIRST_TURN_MAX_CHARS = 1000;

const PROMPT_INSTRUCTIONS = `You are reconciling the yak-shaving tree against the user's currently active conversations.

The yak-shaving tree captures the user's "yak chains" — the original goal a conversation set out to achieve, and the sidequests, detours, and sub-questions that branched off from it. Yak shaving is what happens when "I want X" turns into "to do X I first need Y, but for Y I have to fix Z…". Each link in that chain is its own conversation. The tree must make those chains visible: roots are original goals, descendants are the sidequests they spawned.

A child node is the yak-chain descendant of a parent when one of these signals fires (in roughly this order of strength):

1. **Same worktree.** Conversations sharing a worktree are almost always sidequests of one another. Order them by createdAt — the earliest conversation in a worktree typically captures the original goal, and later ones are detours off it.
2. **Task ancestry overlap.** Conversations whose task ancestries share a branch are usually a chain.
3. **First-turn cues.** "While doing X I noticed Y", "follow-up to <id>", "to fix the bug from <prev>", or implementation-language picking up where a parent design left off.

Reconcile by:

- For each conversation in <active-conversations> with no node in <previous-tree>, call \`mcp__singularity__yak_add_node\`. Place it under its true yak-chain parent's conversation id, or pass \`parentConversationId: null\` for a brand-new root.
- For each entry in <stale-nodes>, call \`mcp__singularity__yak_remove_node\`. Remove leaves before their parents.
- For each conversation that already has a node, call \`mcp__singularity__yak_update_node\` only if its current parent or oneLineContext is wrong. Don't update for the sake of updating.

Use the MCP tools directly — do NOT invoke them via Bash, curl, or HTTP. Add roots before children: \`parentConversationId\` must reference a conversation that already has a node by the time you call.

When the tree matches reality, stop. Do not write a final assistant message, do not read files, do not run any other tool.`;

export async function buildRebuildPayload(): Promise<string> {
  const convs = await listActiveConversations();
  const existingNodes = await db.select().from(_yakShavingNodes);
  const taskCache = new Map<string, Task | null>();

  const activeConvIds = new Set(convs.map((c) => c.id));
  const staleNodes = existingNodes.filter(
    (n) => !activeConvIds.has(n.conversationId),
  );

  const sections: string[] = [PROMPT_INSTRUCTIONS, ""];

  sections.push("<previous-tree>");
  if (existingNodes.length === 0) {
    sections.push("  <!-- empty: no nodes yet -->");
  } else {
    sections.push(formatPreviousTree(existingNodes));
  }
  sections.push("</previous-tree>");
  sections.push("");

  sections.push("<stale-nodes>");
  if (staleNodes.length === 0) {
    sections.push("  <!-- none -->");
  } else {
    for (const n of staleNodes) {
      const ctx = n.oneLineContext
        ? ` oneLineContext=${attr(n.oneLineContext)}`
        : "";
      sections.push(
        `  <node conversationId=${attr(n.conversationId)}${ctx} />`,
      );
    }
  }
  sections.push("</stale-nodes>");
  sections.push("");

  sections.push("<active-conversations>");
  if (convs.length === 0) {
    sections.push("  <!-- none: every active conversation is gone -->");
  } else {
    sections.push(await formatActiveConversations(convs, taskCache));
  }
  sections.push("</active-conversations>");

  return sections.join("\n");
}

function formatPreviousTree(nodes: YakShavingNode[]): string {
  const childrenOf = new Map<string | null, YakShavingNode[]>();
  for (const n of nodes) {
    const arr = childrenOf.get(n.parentNodeId) ?? [];
    arr.push(n);
    childrenOf.set(n.parentNodeId, arr);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => (a.rank ?? "").localeCompare(b.rank ?? ""));
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const lines: string[] = [];
  const recurse = (parentNodeId: string | null, depth: number) => {
    const children = childrenOf.get(parentNodeId) ?? [];
    for (const node of children) {
      const indent = "  ".repeat(depth + 1);
      const attrs: string[] = [
        `conversationId=${attr(node.conversationId)}`,
      ];
      if (node.oneLineContext) {
        attrs.push(`oneLineContext=${attr(node.oneLineContext)}`);
      }
      if (node.nextAction) {
        attrs.push(`nextAction=${attr(node.nextAction)}`);
      }
      const grandchildren = childrenOf.get(node.id) ?? [];
      if (grandchildren.length === 0) {
        lines.push(`${indent}<node ${attrs.join(" ")} />`);
      } else {
        lines.push(`${indent}<node ${attrs.join(" ")}>`);
        recurse(node.id, depth + 1);
        lines.push(`${indent}</node>`);
      }
    }
  };
  recurse(null, 0);

  // If there are nodes whose parent_node_id points outside this set (shouldn't
  // happen, but be defensive), surface them as roots so the model can fix them.
  const orphans = nodes.filter(
    (n) => n.parentNodeId !== null && !nodeById.has(n.parentNodeId),
  );
  if (orphans.length > 0) {
    lines.push(`  <!-- orphaned nodes (parent_node_id missing) -->`);
    for (const node of orphans) {
      const attrs = [`conversationId=${attr(node.conversationId)}`];
      if (node.oneLineContext) {
        attrs.push(`oneLineContext=${attr(node.oneLineContext)}`);
      }
      lines.push(`  <node ${attrs.join(" ")} />`);
    }
  }

  return lines.join("\n");
}

async function formatActiveConversations(
  convs: Conversation[],
  taskCache: Map<string, Task | null>,
): Promise<string> {
  const byAttempt = new Map<string, Conversation[]>();
  for (const c of convs) {
    const arr = byAttempt.get(c.attemptId) ?? [];
    arr.push(c);
    byAttempt.set(c.attemptId, arr);
  }
  for (const arr of byAttempt.values()) {
    arr.sort((a, b) => +a.createdAt - +b.createdAt);
  }
  const attemptOrder = [...byAttempt.entries()].sort((a, b) => {
    const aMin = +a[1][0]!.createdAt;
    const bMin = +b[1][0]!.createdAt;
    return aMin - bMin;
  });

  const lines: string[] = [];
  for (const [attemptId, attemptConvs] of attemptOrder) {
    lines.push(`  <worktree attemptId=${attr(attemptId)}>`);
    const taskId = attemptConvs[0]?.taskId;
    if (taskId) {
      const ancestry = await buildTaskAncestry(taskId, taskCache);
      if (ancestry.length > 0) {
        lines.push(`    <task-ancestry>`);
        for (const title of ancestry) {
          lines.push(`      <task>${escapeText(title)}</task>`);
        }
        lines.push(`    </task-ancestry>`);
      }
    }
    for (const conv of attemptConvs) {
      const turns = await readConversationTurns(conv.id);
      const firstUserTurn = turns.find((t) => t.role === "user");
      lines.push(
        `    <conversation id=${attr(conv.id)} createdAt=${attr(conv.createdAt.toISOString())}>`,
      );
      lines.push(`      <title>${escapeText(conv.title ?? "Untitled")}</title>`);
      if (firstUserTurn) {
        const text = truncate(firstUserTurn.text.trim(), FIRST_TURN_MAX_CHARS);
        lines.push(`      <first-user-turn>${escapeText(text)}</first-user-turn>`);
      } else {
        lines.push(`      <first-user-turn />`);
      }
      lines.push(`    </conversation>`);
    }
    lines.push(`  </worktree>`);
  }
  return lines.join("\n");
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

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attr(s: string): string {
  return `"${s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")}"`;
}
