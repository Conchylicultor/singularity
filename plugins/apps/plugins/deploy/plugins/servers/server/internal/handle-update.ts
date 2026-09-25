import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { updateServer } from "../../shared/endpoints";
import { _deployServers } from "./tables";
import { toServer } from "./project-server";

export const handleUpdate = implement(
  updateServer,
  async ({ params, body }) => {
    // `updatedAt` is derived (deriveUpdatedAt on `_deployServers`): the trigger
    // bumps it only when a counted column really changes.
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.host !== undefined) updates.host = body.host;
    if (body.port !== undefined) updates.port = body.port;
    if (body.sshUser !== undefined) updates.sshUser = body.sshUser;
    if (body.consoleUrl !== undefined)
      updates.consoleUrl = body.consoleUrl || null;

    // An empty patch has nothing to write (drizzle rejects an empty `set`):
    // answer the row as it stands.
    const [row] =
      Object.keys(updates).length === 0
        ? await db
            .select()
            .from(_deployServers)
            .where(eq(_deployServers.id, params.id))
            .limit(1)
        : await db
            .update(_deployServers)
            .set(updates)
            .where(eq(_deployServers.id, params.id))
            .returning();
    if (!row) throw new HttpError(404, "Not found");
    return toServer(row);
  },
);
