import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { updateServer } from "../../shared/endpoints";
import { _deployServers } from "./tables";
import { toServer } from "./project-server";

export const handleUpdate = implement(updateServer, async ({ params, body }) => {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.host !== undefined) updates.host = body.host;
  if (body.port !== undefined) updates.port = body.port;
  if (body.sshUser !== undefined) updates.sshUser = body.sshUser;
  if (body.consoleUrl !== undefined) updates.consoleUrl = body.consoleUrl || null;

  const [row] = await db
    .update(_deployServers)
    .set(updates)
    .where(eq(_deployServers.id, params.id))
    .returning();
  if (!row) throw new HttpError(404, "Not found");
  return toServer(row);
});
