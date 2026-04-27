import {
  getTask,
  listActiveConversations,
  type Conversation,
  type Task,
} from "@plugins/tasks-core/server";
import { readConversationTurns } from "@plugins/conversations/server";
import { db } from "@server/db/client";
import { _yakShavingCategories, _yakShavingNodes } from "./tables";
import type { YakShavingCategory, YakShavingNode } from "./schema";

// Most first-user turns are well under 4000 chars. For the longer ones we
// keep a head and tail slice so the model still sees both the original ask
// and any follow-up clarifications, with the wandering middle dropped.
const FIRST_TURN_HEAD_CHARS = 2500;
const FIRST_TURN_TAIL_CHARS = 1500;

const PROMPT_INSTRUCTIONS = `You are reconciling the yak-shaving tree against the user's currently active conversations.

The tree groups conversations to minimise the user's mental overhead. It has two kinds of nodes:

- **Conversation nodes** represent active conversations. They form parent-child edges that answer two practical questions:
  1. **What must sequence?** Conversation B is a child of A when A's outcome directly gates B — a design that must be settled before implementation, a plan review before the fix, an investigation before the architectural decision.
  2. **What shares context?** Conversations tackling the same architectural concern from different angles (e.g. two parallel designs that must converge) belong together as siblings under a shared root, so the user knows they need to be reconciled before either proceeds.
- **Categories** are organizational headers (\`title\` + \`description\`). Use them to cluster conversations that share a theme but have no sequencing/blocking relationship. Categories may nest inside other categories, but a category may NOT be a child of a conversation node — categories sit *above* the content layer.

A conversation node has at most one parent: either another conversation node, or a category, or null (root). Never both.

**Signals for conversation-node parent placement (in order of strength):**

1. **Same worktree.** Conversations sharing a worktree are almost always sequential. Order by createdAt — the earliest is the root, later ones are children (or grandchildren if they chain further).
2. **Explicit blocking.** "Implement the design from X", "follow-up to X", "plan review before fixing X" — B cannot meaningfully proceed until A is done.
3. **Convergence.** Two or more conversations addressing the same root problem from different angles should be grouped as siblings under a shared parent (or under the earliest one if it's clearly foundational), with the expectation that they must be reconciled.
4. **Task ancestry overlap.** Conversations whose task trees share a branch are likely related work.
5. **First-turn cues.** Phrasing that picks up where another conversation left off ("while doing X I noticed Y", "to fix the bug from <prev>").

**What does NOT make a child:** thematic similarity alone (two separate bug fixes in the same subsystem), temporal proximity without a blocking relationship, or parallel investigations that don't need to converge. These are signals for a *category*, not a conversation-parent edge.

**When to create a category:** ≥3 active conversations share a theme that the rules above wouldn't cluster (e.g. "Plugin polish", "Tooling / dev-loop", "Bug investigations"). The category's \`title\` is a short header, the \`description\` is a one-line explainer.

**When NOT to create a category:** for a single conversation; as a workaround when a real blocking relationship exists (use a conversation parent); just to flatten the visual tree. Prefer at most 2 levels of nested categories unless the user clearly has a deeper organization.

Reconcile by:

- For each entry in \`<active-conversations>\` that has no node yet, call \`mcp__singularity__yak_add_node\`. Pass \`parent: null\` for a root, \`parent: { kind: "conversation", conversationId }\` for a sequencing/convergence parent, or \`parent: { kind: "category", categoryId }\` for an organizational parent. Add roots before children — both the parent conversation node and the parent category must already exist by the time you call.
- If you need a new category before placing nodes, call \`mcp__singularity__yak_add_category\` first. Add root categories before nested ones.
- For each entry in \`<stale-nodes>\`, call \`mcp__singularity__yak_remove_node\`. Remove leaves before their parents.
- For each conversation that already has a node, call \`mcp__singularity__yak_update_node\` only if its parent or oneLineContext is wrong. Don't update for the sake of updating.
- For an existing category whose title/description/parent is wrong, call \`mcp__singularity__yak_update_category\`.
- After reparenting children, remove now-empty categories with \`mcp__singularity__yak_remove_category\`. (Empty = no child categories AND no conversation nodes parented under it.)

Use the MCP tools directly — do NOT invoke them via Bash, curl, or HTTP.

When the tree matches reality, stop. Do not write a final assistant message, do not read any other files, do not run any other tool.`;

export async function buildRebuildPayload(
  contextPath: string,
): Promise<{ prompt: string; context: string }> {
  const convs = await listActiveConversations();
  const existingNodes = await db.select().from(_yakShavingNodes);
  const existingCategories = await db.select().from(_yakShavingCategories);
  const taskCache = new Map<string, Task | null>();

  const activeConvIds = new Set(convs.map((c) => c.id));
  const staleNodes = existingNodes.filter(
    (n) => !activeConvIds.has(n.conversationId),
  );

  const sections: string[] = [];

  sections.push("<previous-tree>");
  if (existingNodes.length === 0 && existingCategories.length === 0) {
    sections.push("  <!-- empty: no nodes or categories yet -->");
  } else {
    sections.push(formatPreviousTree(existingNodes, existingCategories));
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

  const context = sections.join("\n");
  const prompt = `${PROMPT_INSTRUCTIONS}\n\nThe rebuild context (previous tree, stale nodes, active conversations) lives at \`${contextPath}\`. Read that file with the Read tool before doing anything else, then reconcile by calling the yak_* MCP tools as described above.`;
  return { prompt, context };
}

function formatPreviousTree(
  nodes: YakShavingNode[],
  categories: YakShavingCategory[],
): string {
  const childCategoriesOf = new Map<string | null, YakShavingCategory[]>();
  for (const c of categories) {
    const arr = childCategoriesOf.get(c.parentCategoryId) ?? [];
    arr.push(c);
    childCategoriesOf.set(c.parentCategoryId, arr);
  }
  const childNodesOfCategory = new Map<string, YakShavingNode[]>();
  const childNodesOfNode = new Map<string, YakShavingNode[]>();
  const rootNodes: YakShavingNode[] = [];
  for (const n of nodes) {
    if (n.parentCategoryId !== null) {
      const arr = childNodesOfCategory.get(n.parentCategoryId) ?? [];
      arr.push(n);
      childNodesOfCategory.set(n.parentCategoryId, arr);
    } else if (n.parentNodeId !== null) {
      const arr = childNodesOfNode.get(n.parentNodeId) ?? [];
      arr.push(n);
      childNodesOfNode.set(n.parentNodeId, arr);
    } else {
      rootNodes.push(n);
    }
  }
  for (const arr of childCategoriesOf.values()) {
    arr.sort((a, b) => (a.rank ?? "").localeCompare(b.rank ?? ""));
  }
  for (const arr of childNodesOfCategory.values()) {
    arr.sort((a, b) => (a.rank ?? "").localeCompare(b.rank ?? ""));
  }
  for (const arr of childNodesOfNode.values()) {
    arr.sort((a, b) => (a.rank ?? "").localeCompare(b.rank ?? ""));
  }
  rootNodes.sort((a, b) => (a.rank ?? "").localeCompare(b.rank ?? ""));

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const lines: string[] = [];

  const renderNode = (node: YakShavingNode, depth: number) => {
    const indent = "  ".repeat(depth + 1);
    const attrs: string[] = [`conversationId=${attr(node.conversationId)}`];
    if (node.oneLineContext) {
      attrs.push(`oneLineContext=${attr(node.oneLineContext)}`);
    }
    if (node.nextAction) {
      attrs.push(`nextAction=${attr(node.nextAction)}`);
    }
    const grandchildren = childNodesOfNode.get(node.id) ?? [];
    if (grandchildren.length === 0) {
      lines.push(`${indent}<node ${attrs.join(" ")} />`);
    } else {
      lines.push(`${indent}<node ${attrs.join(" ")}>`);
      for (const child of grandchildren) renderNode(child, depth + 1);
      lines.push(`${indent}</node>`);
    }
  };

  const renderCategory = (cat: YakShavingCategory, depth: number) => {
    const indent = "  ".repeat(depth + 1);
    const attrs: string[] = [
      `id=${attr(cat.id)}`,
      `title=${attr(cat.title)}`,
      `description=${attr(cat.description)}`,
    ];
    const childCats = childCategoriesOf.get(cat.id) ?? [];
    const childNodes = childNodesOfCategory.get(cat.id) ?? [];
    if (childCats.length === 0 && childNodes.length === 0) {
      lines.push(`${indent}<category ${attrs.join(" ")} />`);
      return;
    }
    lines.push(`${indent}<category ${attrs.join(" ")}>`);
    for (const c of childCats) renderCategory(c, depth + 1);
    for (const n of childNodes) renderNode(n, depth + 1);
    lines.push(`${indent}</category>`);
  };

  const rootCategories = childCategoriesOf.get(null) ?? [];
  for (const c of rootCategories) renderCategory(c, 0);
  for (const n of rootNodes) renderNode(n, 0);

  // Defensive: surface nodes whose parent points outside the known set so the
  // model can fix them. Same for categories.
  const orphanNodes = nodes.filter(
    (n) =>
      (n.parentNodeId !== null && !nodeById.has(n.parentNodeId)) ||
      (n.parentCategoryId !== null && !categoryById.has(n.parentCategoryId)),
  );
  if (orphanNodes.length > 0) {
    lines.push(`  <!-- orphaned nodes (parent missing) -->`);
    for (const n of orphanNodes) {
      const attrs = [`conversationId=${attr(n.conversationId)}`];
      if (n.oneLineContext) {
        attrs.push(`oneLineContext=${attr(n.oneLineContext)}`);
      }
      lines.push(`  <node ${attrs.join(" ")} />`);
    }
  }
  const orphanCategories = categories.filter(
    (c) =>
      c.parentCategoryId !== null && !categoryById.has(c.parentCategoryId),
  );
  if (orphanCategories.length > 0) {
    lines.push(`  <!-- orphaned categories (parent missing) -->`);
    for (const c of orphanCategories) {
      lines.push(
        `  <category id=${attr(c.id)} title=${attr(c.title)} description=${attr(c.description)} />`,
      );
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
        const text = truncateHeadTail(
          firstUserTurn.text.trim(),
          FIRST_TURN_HEAD_CHARS,
          FIRST_TURN_TAIL_CHARS,
        );
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

function truncateHeadTail(text: string, head: number, tail: number): string {
  if (text.length <= head + tail) return text;
  const dropped = text.length - head - tail;
  return `${text.slice(0, head)}\n…[truncated ${dropped} chars]…\n${text.slice(-tail)}`;
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
