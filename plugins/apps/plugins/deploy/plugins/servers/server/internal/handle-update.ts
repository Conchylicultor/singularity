import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { setSecret } from "@plugins/infra/plugins/secrets/server";
import { _deployServers } from "./tables";
import { serversResource } from "./resources";

export async function handleUpdate(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    host?: string;
    port?: number;
    sshUser?: string;
    sshPrivateKey?: string;
  };
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
  if (!row) return new Response("Not found", { status: 404 });
  if (body.sshPrivateKey) {
    await setSecret(
      { namespace: "deploy-ssh", key: params.id },
      body.sshPrivateKey,
    );
  }
  serversResource.notify();
  return Response.json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
