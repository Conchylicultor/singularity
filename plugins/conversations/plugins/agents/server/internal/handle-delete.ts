import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteAgent } from "../../core/endpoints";
import { _agents } from "./tables";
import { agentLaunchesResource, agentsResource } from "./resources";

export const handleDelete = implement(deleteAgent, async ({ params }) => {
  const children = await db
    .select({ id: _agents.id })
    .from(_agents)
    .where(eq(_agents.parentId, params.id))
    .limit(1);
  if (children.length > 0) {
    throw new HttpError(409, "Agent has children");
  }
  const [row] = await db.delete(_agents).where(eq(_agents.id, params.id)).returning();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found");
  // Launches cascade via FK; still notify so subscribed detail views refresh.
  agentsResource.notify();
  agentLaunchesResource.notify();
  // return undefined → implement() sends 204
});
