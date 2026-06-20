import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { setSecret } from "@plugins/infra/plugins/secrets/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { updateServer } from "../../shared/endpoints";
import { _deployServers } from "./tables";

export const handleUpdate = implement(updateServer, async ({ params, body }) => {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.host !== undefined) updates.host = body.host;
  if (body.port !== undefined) updates.port = body.port;
  if (body.sshUser !== undefined) updates.sshUser = body.sshUser;

  const [row] = await db
    .update(_deployServers)
    .set(updates)
    .where(eq(_deployServers.id, params.id))
    .returning();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found");
  if (body.sshPrivateKey) {
    await setSecret(
      { namespace: "deploy-ssh", key: params.id },
      body.sshPrivateKey,
    );
  }
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
});
