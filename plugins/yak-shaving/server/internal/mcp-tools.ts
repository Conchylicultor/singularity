import { and, desc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";
import { db } from "@server/db/client";
import { Mcp } from "@plugins/mcp/server";
import { getConversation } from "@plugins/tasks-core/server";
import { _yakShavingNodes } from "./tables";
import { yakShavingNodesResource } from "./resources";

const TEXT_MAX = 200;

const StatusSchema = z.enum(["ready", "blocked", "working"]);

async function nextRankUnder(parentNodeId: string | null): Promise<string> {
  const [last] = await db
    .select({ rank: _yakShavingNodes.rank })
    .from(_yakShavingNodes)
    .where(
      parentNodeId === null
        ? isNull(_yakShavingNodes.parentNodeId)
        : eq(_yakShavingNodes.parentNodeId, parentNodeId),
    )
    .orderBy(desc(_yakShavingNodes.rank))
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

function newNodeId(): string {
  return `yak-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

Mcp.registerTool({
  name: "yak_add_node",
  description: `Add a new node to the yak-shaving tree for a conversation that
isn't already in the tree.

Fails if a node already exists for \`conversationId\` (use \`yak_update_node\`
instead) or if \`conversationId\` doesn't reference a real conversation.

Place the node under \`parentConversationId\` if one of the existing tree
nodes is the parent thread; pass \`null\` for a new root.`,
  inputSchema: {
    conversationId: z
      .string()
      .min(1)
      .describe("ID of the conversation this node represents."),
    parentConversationId: z
      .string()
      .nullable()
      .describe(
        "Conversation ID of the parent node, or null to create a root. The parent must already have a node in the tree.",
      ),
    oneLineContext: oneLineContextField,
    status: StatusSchema.optional().describe(
      "Optional model-derived status: 'ready', 'blocked', or 'working'.",
    ),
  },
  async handler({ conversationId, parentConversationId, oneLineContext, status }) {
    await assertConversationExists(conversationId);

    if (await getNodeByConvId(conversationId)) {
      throw new Error(
        `A node already exists for conversation "${conversationId}". Use yak_update_node to modify it.`,
      );
    }

    let parentNodeId: string | null = null;
    if (parentConversationId !== null) {
      const parent = await getNodeByConvId(parentConversationId);
      if (!parent) {
        throw new Error(
          `No node exists for parentConversationId "${parentConversationId}". Add the parent first, or pass null to create a root.`,
        );
      }
      parentNodeId = parent.id;
    }

    const id = newNodeId();
    const rank = await nextRankUnder(parentNodeId);
    await db.insert(_yakShavingNodes).values({
      id,
      conversationId,
      parentNodeId,
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

Only the fields you pass are written. Pass \`parentConversationId: null\` to
re-parent the node as a root; pass another conversation's id to move it
under that node. Re-parenting that would create a cycle is rejected.`,
  inputSchema: {
    conversationId: z
      .string()
      .min(1)
      .describe("ID of the conversation whose node should be updated."),
    parentConversationId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Optional new parent. null re-parents to root; a conversation id moves the node under that node (which must already exist).",
      ),
    oneLineContext: oneLineContextField.optional(),
    status: StatusSchema.optional().describe(
      "Optional model-derived status: 'ready', 'blocked', or 'working'.",
    ),
    nextAction: nextActionField.optional(),
  },
  async handler({
    conversationId,
    parentConversationId,
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

    const reparenting = parentConversationId !== undefined;
    if (
      !reparenting &&
      oneLineContext === undefined &&
      status === undefined &&
      nextAction === undefined
    ) {
      throw new Error(
        "yak_update_node requires at least one of: parentConversationId, oneLineContext, status, nextAction.",
      );
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (reparenting) {
      let newParentNodeId: string | null = null;
      if (parentConversationId !== null) {
        if (parentConversationId === conversationId) {
          throw new Error("A node cannot be its own parent.");
        }
        const parent = await getNodeByConvId(parentConversationId);
        if (!parent) {
          throw new Error(
            `No node exists for parentConversationId "${parentConversationId}". Add the parent first, or pass null to make this a root.`,
          );
        }
        if (!(await isParentSafe(node.id, parent.id))) {
          throw new Error(
            `Re-parenting "${conversationId}" under "${parentConversationId}" would create a cycle.`,
          );
        }
        newParentNodeId = parent.id;
      }
      if (newParentNodeId !== node.parentNodeId) {
        patch.parentNodeId = newParentNodeId;
        patch.rank = await nextRankUnder(newParentNodeId);
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
