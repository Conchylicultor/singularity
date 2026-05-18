import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { hasSecret } from "@plugins/infra/plugins/secrets/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listServers } from "../../shared/endpoints";
import { _deployServers } from "./tables";

export const handleList = implement(listServers, async () => {
  const rows = await db
    .select()
    .from(_deployServers)
    .orderBy(asc(_deployServers.createdAt));
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      sshKeyConfigured: await hasSecret({ namespace: "deploy-ssh", key: r.id }),
    })),
  );
});
