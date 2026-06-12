import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createAgent } from "../../core/endpoints";
import { AgentSchema } from "../../core/schemas";
import { _agents } from "./tables";
import { agents } from "./schema";
import { nextAgentRankUnder } from "./rank";
import { agentsResource } from "./resources";

export const handleCreate = implement(createAgent, async ({ body }) => {
  const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parentId = body.parentId ?? null;
  const rank = await nextAgentRankUnder(parentId);
  await db
    .insert(_agents)
    .values({
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
  if (parentId) {
    await db
      .update(_agents)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_agents.id, parentId));
  }
  agentsResource.notify();
  const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(500, "Failed to retrieve created agent");
  return AgentSchema.parse(row);
});
