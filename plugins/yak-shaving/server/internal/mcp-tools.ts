import { and, desc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";
import { db } from "@server/db/client";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import { getConversation } from "@plugins/tasks-core/server";
import { _yakShavingCategories, _yakShavingNodes } from "./tables";
import {
  yakShavingCategoriesResource,
  yakShavingNodesResource,
} from "./resources";

const TEXT_MAX = 200;
const CATEGORY_TITLE_MAX = 100;
const CATEGORY_DESCRIPTION_MAX = 300;

const StatusSchema = z.enum(["ready", "blocked", "working"]);

type ParentKey =
  | { kind: "root" }
  | { kind: "node"; parentNodeId: string }
  | { kind: "category"; parentCategoryId: string };

async function nextNodeRankUnder(parent: ParentKey): Promise<string> {
  const where =
    parent.kind === "root"
      ? and(
          isNull(_yakShavingNodes.parentNodeId),
          isNull(_yakShavingNodes.parentCategoryId),
        )
      : parent.kind === "node"
        ? eq(_yakShavingNodes.parentNodeId, parent.parentNodeId)
        : eq(_yakShavingNodes.parentCategoryId, parent.parentCategoryId);
  const [last] = await db
    .select({ rank: _yakShavingNodes.rank })
    .from(_yakShavingNodes)
    .where(where)
    .orderBy(desc(_yakShavingNodes.rank))
    .limit(1);
  return generateKeyBetween(last?.rank ?? null, null);
}

async function nextCategoryRankUnder(
  parentCategoryId: string | null,
): Promise<string> {
  const [last] = await db
    .select({ rank: _yakShavingCategories.rank })
    .from(_yakShavingCategories)
    .where(
      parentCategoryId === null
        ? isNull(_yakShavingCategories.parentCategoryId)
        : eq(_yakShavingCategories.parentCategoryId, parentCategoryId),
    )
    .orderBy(desc(_yakShavingCategories.rank))
    .limit(1);
  return generateKeyBetween(last?.rank ?? null, null);
}

async function getNodeByConvId(conversationId: string) {
  const [row] = await db
    .select()
    .from(_yakShavingNodes)
    .where(eq(_yakShavingNodes.conversationId, conversationId))
    .limit(1);
  return row ?? null;
}

async function getCategoryById(categoryId: string) {
  const [row] = await db
    .select()
    .from(_yakShavingCategories)
    .where(eq(_yakShavingCategories.id, categoryId))
    .limit(1);
  return row ?? null;
}

async function assertConversationExists(conversationId: string): Promise<void> {
  const conv = await getConversation(conversationId);
  if (!conv) {
    throw new Error(
      `No conversation with id "${conversationId}". Pass a conversationId that appears in the prompt's conversation list.`,
    );
  }
}

// Walk up from `candidateParentNodeId`. If we hit `selfNodeId`, the move would
// create a cycle. Returns true when safe.
async function isParentSafe(
  selfNodeId: string,
  candidateParentNodeId: string | null,
): Promise<boolean> {
  let cursor = candidateParentNodeId;
  const seen = new Set<string>();
  while (cursor !== null) {
    if (cursor === selfNodeId) return false;
    if (seen.has(cursor)) return false; // existing cycle in the table; bail
    seen.add(cursor);
    const [row] = await db
      .select({ parentNodeId: _yakShavingNodes.parentNodeId })
      .from(_yakShavingNodes)
      .where(eq(_yakShavingNodes.id, cursor))
      .limit(1);
    if (!row) return false; // unknown ancestor — refuse rather than orphan
    cursor = row.parentNodeId;
  }
  return true;
}

async function isCategoryParentSafe(
  selfCategoryId: string,
  candidateParentCategoryId: string | null,
): Promise<boolean> {
  let cursor = candidateParentCategoryId;
  const seen = new Set<string>();
  while (cursor !== null) {
    if (cursor === selfCategoryId) return false;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    const [row] = await db
      .select({ parentCategoryId: _yakShavingCategories.parentCategoryId })
      .from(_yakShavingCategories)
      .where(eq(_yakShavingCategories.id, cursor))
      .limit(1);
    if (!row) return false;
    cursor = row.parentCategoryId;
  }
  return true;
}

function newNodeId(): string {
  return `yak-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newCategoryId(): string {
  return `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const oneLineContextField = z
  .string()
  .min(1)
  .max(TEXT_MAX)
  .describe(
    `One-line summary of what this conversation is about (≤ ${TEXT_MAX} chars). Plain prose, no IDs.`,
  );

const nextActionField = z
  .string()
  .min(1)
  .max(TEXT_MAX)
  .describe(
    `Concrete next step the user (or an agent) should take to move this conversation forward (≤ ${TEXT_MAX} chars).`,
  );

const NodeParentSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("conversation"),
      conversationId: z
        .string()
        .min(1)
        .describe(
          "Conversation id of the parent node. The parent must already have a node in the tree.",
        ),
    }),
    z.object({
      kind: z.literal("category"),
      categoryId: z
        .string()
        .min(1)
        .describe(
          "Id of the parent category. The category must already exist (use yak_add_category first).",
        ),
    }),
  ])
  .nullable()
  .describe(
    "Parent of this node: either a conversation node (sequencing/convergence) or a category (organizational), or null for a root.",
  );

type NodeParent = z.infer<typeof NodeParentSchema>;

// Resolve a NodeParent from the model (conversation/category/null) into the
// table-level (parentNodeId, parentCategoryId) pair plus a ParentKey for
// rank assignment. Validates that the referenced parent exists.
async function resolveNodeParent(parent: NodeParent): Promise<{
  parentNodeId: string | null;
  parentCategoryId: string | null;
  rankKey: ParentKey;
}> {
  if (parent === null) {
    return {
      parentNodeId: null,
      parentCategoryId: null,
      rankKey: { kind: "root" },
    };
  }
  if (parent.kind === "conversation") {
    const parentNode = await getNodeByConvId(parent.conversationId);
    if (!parentNode) {
      throw new Error(
        `No node exists for conversationId "${parent.conversationId}". Add the parent node first, or pass a category parent or null.`,
      );
    }
    return {
      parentNodeId: parentNode.id,
      parentCategoryId: null,
      rankKey: { kind: "node", parentNodeId: parentNode.id },
    };
  }
  const cat = await getCategoryById(parent.categoryId);
  if (!cat) {
    throw new Error(
      `No category exists with id "${parent.categoryId}". Use yak_add_category first.`,
    );
  }
  return {
    parentNodeId: null,
    parentCategoryId: cat.id,
    rankKey: { kind: "category", parentCategoryId: cat.id },
  };
}

Mcp.registerTool({
  name: "yak_add_node",
  description: `Add a new node to the yak-shaving tree for a conversation that
isn't already in the tree.

Fails if a node already exists for \`conversationId\` (use \`yak_update_node\`
instead) or if \`conversationId\` doesn't reference a real conversation.

\`parent\` selects the placement:
- \`null\` — root node.
- \`{ kind: "conversation", conversationId }\` — child of an existing
  conversation node (sequencing / convergence).
- \`{ kind: "category", categoryId }\` — child of an existing category
  (organizational grouping).`,
  inputSchema: {
    conversationId: z
      .string()
      .min(1)
      .describe("ID of the conversation this node represents."),
    parent: NodeParentSchema,
    oneLineContext: oneLineContextField,
    status: StatusSchema.optional().describe(
      "Optional model-derived status: 'ready', 'blocked', or 'working'.",
    ),
  },
  async handler({ conversationId, parent, oneLineContext, status }) {
    await assertConversationExists(conversationId);

    if (await getNodeByConvId(conversationId)) {
      throw new Error(
        `A node already exists for conversation "${conversationId}". Use yak_update_node to modify it.`,
      );
    }

    const { parentNodeId, parentCategoryId, rankKey } =
      await resolveNodeParent(parent);

    const id = newNodeId();
    const rank = await nextNodeRankUnder(rankKey);
    await db.insert(_yakShavingNodes).values({
      id,
      conversationId,
      parentNodeId,
      parentCategoryId,
      oneLineContext,
      status: status ?? null,
      rank,
    });
    yakShavingNodesResource.notify();

    return {
      content: [
        { type: "text", text: JSON.stringify({ ok: true, node_id: id }) },
      ],
    };
  },
});

Mcp.registerTool({
  name: "yak_update_node",
  description: `Update fields on the yak-shaving node for an existing
conversation. Fails if no node exists for \`conversationId\` (use
\`yak_add_node\` instead).

Only the fields you pass are written. Pass \`parent: null\` to re-parent the
node as a root; pass \`{ kind: "conversation", conversationId }\` to move it
under another node; pass \`{ kind: "category", categoryId }\` to move it
under a category. Re-parenting that would create a cycle is rejected.`,
  inputSchema: {
    conversationId: z
      .string()
      .min(1)
      .describe("ID of the conversation whose node should be updated."),
    parent: NodeParentSchema.optional().describe(
      "Optional new parent. Omit to leave parent unchanged. null re-parents to root.",
    ),
    oneLineContext: oneLineContextField.optional(),
    status: StatusSchema.optional().describe(
      "Optional model-derived status: 'ready', 'blocked', or 'working'.",
    ),
    nextAction: nextActionField.optional(),
  },
  async handler({
    conversationId,
    parent,
    oneLineContext,
    status,
    nextAction,
  }) {
    const node = await getNodeByConvId(conversationId);
    if (!node) {
      throw new Error(
        `No node exists for conversation "${conversationId}". Use yak_add_node to create it.`,
      );
    }

    const reparenting = parent !== undefined;
    if (
      !reparenting &&
      oneLineContext === undefined &&
      status === undefined &&
      nextAction === undefined
    ) {
      throw new Error(
        "yak_update_node requires at least one of: parent, oneLineContext, status, nextAction.",
      );
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (reparenting) {
      if (
        parent !== null &&
        parent.kind === "conversation" &&
        parent.conversationId === conversationId
      ) {
        throw new Error("A node cannot be its own parent.");
      }
      const resolved = await resolveNodeParent(parent);
      if (
        resolved.parentNodeId !== null &&
        !(await isParentSafe(node.id, resolved.parentNodeId))
      ) {
        throw new Error(
          `Re-parenting "${conversationId}" under that node would create a cycle.`,
        );
      }
      const parentChanged =
        resolved.parentNodeId !== node.parentNodeId ||
        resolved.parentCategoryId !== node.parentCategoryId;
      if (parentChanged) {
        patch.parentNodeId = resolved.parentNodeId;
        patch.parentCategoryId = resolved.parentCategoryId;
        patch.rank = await nextNodeRankUnder(resolved.rankKey);
      }
    }

    if (oneLineContext !== undefined) patch.oneLineContext = oneLineContext;
    if (status !== undefined) patch.status = status;
    if (nextAction !== undefined) patch.nextAction = nextAction;

    await db
      .update(_yakShavingNodes)
      .set(patch)
      .where(eq(_yakShavingNodes.id, node.id));
    yakShavingNodesResource.notify();

    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    };
  },
});

Mcp.registerTool({
  name: "yak_remove_node",
  description: `Remove the yak-shaving node for a conversation. Fails if no
node exists for \`conversationId\`, or if the node still has children — remove
or re-parent the children first.`,
  inputSchema: {
    conversationId: z
      .string()
      .min(1)
      .describe("ID of the conversation whose node should be removed."),
  },
  async handler({ conversationId }) {
    const node = await getNodeByConvId(conversationId);
    if (!node) {
      throw new Error(
        `No node exists for conversation "${conversationId}".`,
      );
    }

    const children = await db
      .select({ id: _yakShavingNodes.id })
      .from(_yakShavingNodes)
      .where(eq(_yakShavingNodes.parentNodeId, node.id))
      .limit(1);
    if (children.length > 0) {
      throw new Error(
        `Node for "${conversationId}" still has children. Remove or re-parent them before deleting this node.`,
      );
    }

    await db
      .delete(_yakShavingNodes)
      .where(
        and(
          eq(_yakShavingNodes.id, node.id),
          eq(_yakShavingNodes.conversationId, conversationId),
        ),
      );
    yakShavingNodesResource.notify();

    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    };
  },
});

const categoryTitleField = z
  .string()
  .min(1)
  .max(CATEGORY_TITLE_MAX)
  .describe(
    `Short header for the category (≤ ${CATEGORY_TITLE_MAX} chars). Plain prose, no IDs.`,
  );

const categoryDescriptionField = z
  .string()
  .min(1)
  .max(CATEGORY_DESCRIPTION_MAX)
  .describe(
    `One-line description explaining what the category clusters (≤ ${CATEGORY_DESCRIPTION_MAX} chars).`,
  );

Mcp.registerTool({
  name: "yak_add_category",
  description: `Add a new category to the yak-shaving tree. Categories are
organizational headers that cluster conversations sharing a theme but no
sequencing/blocking relationship.

Use a category when ≥3 active conversations share a theme that the
sequencing/convergence rules wouldn't cluster (e.g. "Plugin polish",
"Tooling", "Bug investigations"). Don't create a category for a single
conversation.

\`parentCategoryId\` nests this category under another. Pass \`null\` for a
root category. Categories cannot be children of conversation nodes.`,
  inputSchema: {
    parentCategoryId: z
      .string()
      .nullable()
      .describe(
        "Id of the parent category, or null for a root. The parent must already exist.",
      ),
    title: categoryTitleField,
    description: categoryDescriptionField,
  },
  async handler({ parentCategoryId, title, description }) {
    if (parentCategoryId !== null) {
      const parent = await getCategoryById(parentCategoryId);
      if (!parent) {
        throw new Error(
          `No category exists with id "${parentCategoryId}". Add the parent first, or pass null.`,
        );
      }
    }

    const id = newCategoryId();
    const rank = await nextCategoryRankUnder(parentCategoryId);
    await db.insert(_yakShavingCategories).values({
      id,
      parentCategoryId,
      title,
      description,
      rank,
    });
    yakShavingCategoriesResource.notify();

    return {
      content: [
        { type: "text", text: JSON.stringify({ ok: true, category_id: id }) },
      ],
    };
  },
});

Mcp.registerTool({
  name: "yak_update_category",
  description: `Update fields on a category. Only the fields you pass are
written. Pass \`parentCategoryId: null\` to re-parent to a root; another
category id to nest under it. Re-parenting that would create a cycle is
rejected.`,
  inputSchema: {
    categoryId: z.string().min(1).describe("Id of the category to update."),
    parentCategoryId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Optional new parent. Omit to leave unchanged. null re-parents to root.",
      ),
    title: categoryTitleField.optional(),
    description: categoryDescriptionField.optional(),
  },
  async handler({ categoryId, parentCategoryId, title, description }) {
    const cat = await getCategoryById(categoryId);
    if (!cat) {
      throw new Error(`No category exists with id "${categoryId}".`);
    }

    const reparenting = parentCategoryId !== undefined;
    if (!reparenting && title === undefined && description === undefined) {
      throw new Error(
        "yak_update_category requires at least one of: parentCategoryId, title, description.",
      );
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (reparenting) {
      if (parentCategoryId === categoryId) {
        throw new Error("A category cannot be its own parent.");
      }
      if (parentCategoryId !== null) {
        const parent = await getCategoryById(parentCategoryId);
        if (!parent) {
          throw new Error(
            `No category exists with id "${parentCategoryId}". Add the parent first, or pass null.`,
          );
        }
        if (!(await isCategoryParentSafe(cat.id, parentCategoryId))) {
          throw new Error(
            `Re-parenting "${categoryId}" under "${parentCategoryId}" would create a cycle.`,
          );
        }
      }
      if (parentCategoryId !== cat.parentCategoryId) {
        patch.parentCategoryId = parentCategoryId;
        patch.rank = await nextCategoryRankUnder(parentCategoryId);
      }
    }

    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;

    await db
      .update(_yakShavingCategories)
      .set(patch)
      .where(eq(_yakShavingCategories.id, cat.id));
    yakShavingCategoriesResource.notify();

    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    };
  },
});

Mcp.registerTool({
  name: "yak_remove_category",
  description: `Remove a category. Fails if the category still has children —
either child categories or conversation nodes parented under it. Reparent or
remove the children first.`,
  inputSchema: {
    categoryId: z.string().min(1).describe("Id of the category to remove."),
  },
  async handler({ categoryId }) {
    const cat = await getCategoryById(categoryId);
    if (!cat) {
      throw new Error(`No category exists with id "${categoryId}".`);
    }

    const childCategories = await db
      .select({ id: _yakShavingCategories.id })
      .from(_yakShavingCategories)
      .where(eq(_yakShavingCategories.parentCategoryId, cat.id))
      .limit(1);
    if (childCategories.length > 0) {
      throw new Error(
        `Category "${categoryId}" still has child categories. Reparent or remove them first.`,
      );
    }

    const childNodes = await db
      .select({ id: _yakShavingNodes.id })
      .from(_yakShavingNodes)
      .where(eq(_yakShavingNodes.parentCategoryId, cat.id))
      .limit(1);
    if (childNodes.length > 0) {
      throw new Error(
        `Category "${categoryId}" still has conversation nodes parented under it. Reparent or remove them first.`,
      );
    }

    await db
      .delete(_yakShavingCategories)
      .where(eq(_yakShavingCategories.id, cat.id));
    yakShavingCategoriesResource.notify();

    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    };
  },
});
