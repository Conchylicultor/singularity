import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _agents } from "./tables";
import { nextAgentRankUnder } from "./rank";
import { agentsResource } from "./resources";

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    parentId?: string | null;
    name?: string;
    prompt?: string | null;
    model?: string | null;
    icon?: string | null;
    iconColor?: string | null;
    iconSvgNodes?: string | null;
  };
  const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parentId = body.parentId ?? null;
  const rank = await nextAgentRankUnder(parentId);
  const [row] = await db
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
    })
    .returning();
  if (parentId) {
    await db
      .update(_agents)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_agents.id, parentId));
  }
  agentsResource.notify();
  return Response.json(row);
}
