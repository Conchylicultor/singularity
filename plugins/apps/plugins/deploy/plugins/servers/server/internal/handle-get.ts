import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { hasSecret } from "@plugins/infra/plugins/secrets/server";
import { _deployServers } from "./tables";

export async function handleGet(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const [row] = await db
    .select()
    .from(_deployServers)
    .where(eq(_deployServers.id, params.id));
  if (!row) return new Response("Not found", { status: 404 });
  return Response.json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sshKeyConfigured: await hasSecret({ namespace: "deploy-ssh", key: row.id }),
  });
}
