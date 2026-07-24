import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _deployServers } from "./tables";
import { toServers } from "./project-server";
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
    return toServers(rows);
  },
});
