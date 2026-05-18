import { db } from "@plugins/database/server";
import { setSecret } from "@plugins/infra/plugins/secrets/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createServer } from "../../shared/endpoints";
import { _deployServers } from "./tables";
import { serversResource } from "./resources";

export const handleCreate = implement(createServer, async ({ body }) => {
  if (!body.host) {
    throw new HttpError(400, "host is required");
  }
  const id = `srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db
    .insert(_deployServers)
    .values({
      id,
      name: body.name || body.host,
      host: body.host,
      port: body.port ?? 22,
      sshUser: body.sshUser ?? "root",
    })
    .returning();
  if (body.sshPrivateKey) {
    await setSecret({ namespace: "deploy-ssh", key: id }, body.sshPrivateKey);
  }
  serversResource.notify();
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sshKeyConfigured: !!body.sshPrivateKey,
  };
});
