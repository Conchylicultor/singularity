import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _agents } from "./tables";
import { agentLaunchesResource, agentsResource } from "./resources";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const children = await db
    .select({ id: _agents.id })
    .from(_agents)
    .where(eq(_agents.parentId, id))
    .limit(1);
  if (children.length > 0) {
    return new Response("Agent has children", { status: 409 });
  }
  const [row] = await db.delete(_agents).where(eq(_agents.id, id)).returning();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return new Response("Not found", { status: 404 });
  // Launches cascade via FK; still notify so subscribed detail views refresh.
  agentsResource.notify();
  agentLaunchesResource.notify();
  return new Response(null, { status: 204 });
}
