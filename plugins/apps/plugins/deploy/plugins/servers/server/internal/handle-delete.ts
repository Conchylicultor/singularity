import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { deleteSecret } from "@plugins/infra/plugins/secrets/server";
import { _deployServers } from "./tables";
import { serversResource } from "./resources";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const [row] = await db
    .delete(_deployServers)
    .where(eq(_deployServers.id, params.id))
    .returning();
  if (!row) return new Response("Not found", { status: 404 });
  await deleteSecret({ namespace: "deploy-ssh", key: params.id });
  serversResource.notify();
  return new Response(null, { status: 204 });
}
