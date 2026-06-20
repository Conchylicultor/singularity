import { db } from "@plugins/database/server";
import { setSecret } from "@plugins/infra/plugins/secrets/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createServer } from "../../shared/endpoints";
import { _deployServers } from "./tables";

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
  if (!row) throw new HttpError(500, "insert returned no row");
  if (body.sshPrivateKey) {
    await setSecret({ namespace: "deploy-ssh", key: id }, body.sshPrivateKey);
  }
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sshKeyConfigured: !!body.sshPrivateKey,
  };
});
