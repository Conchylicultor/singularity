import { db } from "@plugins/database/server";
import { setSecret } from "@plugins/infra/plugins/secrets/server";
import { _deployServers } from "./tables";
import { serversResource } from "./resources";

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    host?: string;
    port?: number;
    sshUser?: string;
    sshPrivateKey?: string;
  };
  if (!body.host) {
    return Response.json({ error: "host is required" }, { status: 400 });
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
  return Response.json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sshKeyConfigured: !!body.sshPrivateKey,
  });
}
