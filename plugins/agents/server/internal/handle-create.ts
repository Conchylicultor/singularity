import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { _agents } from "../schema_internal";
import { nextAgentRankUnder } from "./rank";
import { agentsResource } from "./resources";

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    parentId?: string | null;
    name?: string;
    description?: string | null;
    prompt?: string | null;
    model?: string | null;
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
      description: body.description ?? null,
      prompt: body.prompt ?? null,
      model: body.model ?? null,
      rank,
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
