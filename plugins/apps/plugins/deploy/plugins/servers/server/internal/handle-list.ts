import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listServers } from "../../shared/endpoints";
import { _deployServers } from "./tables";
import { toServers } from "./project-server";

export const handleList = implement(listServers, async () => {
  const rows = await db
    .select()
    .from(_deployServers)
    .orderBy(asc(_deployServers.createdAt));
  return toServers(rows);
});
