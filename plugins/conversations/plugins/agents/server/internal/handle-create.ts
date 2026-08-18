import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createAgent } from "../../core/endpoints";
import { AgentSchema } from "../../core/schemas";
import { _agents } from "./tables";
import { agents } from "./views";
import { agentRankAfterSibling, nextAgentRankUnder } from "./rank";

export const handleCreate = implement(createAgent, async ({ body }) => {
  const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parentId = body.parentId ?? null;
  // Positional intent when the client anchored the insert; plain append otherwise.
  const rank = body.afterId
    ? await agentRankAfterSibling(parentId, body.afterId)
    : await nextAgentRankUnder(parentId);
  await db.insert(_agents).values({
    id,
    parentId,
    name: body.name ?? "Untitled",
    prompt: body.prompt ?? null,
    model: body.model ?? null,
    icon: body.icon ?? null,
    iconColor: body.iconColor ?? null,
    iconSvgNodes: body.iconSvgNodes ?? null,
    rank: rank.toJSON(),
  });
  // No parent force-expand here: expand/collapse is device-local view state owned
  // by the data-view primitive, not a column. The tree reveals the new child
  // client-side (`useTreeRow.addChild` expands the row it created under), so the
  // parent's `updatedAt` no longer moves just because a child was added.
  const [row] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);
  if (!row) throw new HttpError(500, "Failed to retrieve created agent");
  return AgentSchema.parse(row);
});
