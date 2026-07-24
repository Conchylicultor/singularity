import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { hasSecret } from "@plugins/infra/plugins/secrets/server";
import { _deployServers } from "./tables";
import { ServerSchema, type Server } from "../../shared";

export const serversResource = defineResource<Server[]>({
  key: "deploy.servers",
  mode: "push",
  schema: z.array(ServerSchema),
  loader: async () => {
    const rows = await db
      .select()
      .from(_deployServers)
      .orderBy(asc(_deployServers.createdAt));
    return Promise.all(
      rows.map(async (r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        sshKeyConfigured: await hasSecret({
          namespace: "deploy-ssh",
          key: r.id,
        }),
      })),
    );
  },
});
