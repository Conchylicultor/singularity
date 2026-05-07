import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { hasSecret } from "@plugins/infra/plugins/secrets/server";
import { _deployServers } from "./tables";

export async function handleList(_req: Request): Promise<Response> {
  const rows = await db
    .select()
    .from(_deployServers)
    .orderBy(asc(_deployServers.createdAt));
  const result = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      sshKeyConfigured: await hasSecret({ namespace: "deploy-ssh", key: r.id }),
    })),
  );
  return Response.json(result);
}
