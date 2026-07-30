import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listDeployments } from "../../core/endpoints";
import { _deployDeployments } from "./tables";
import { toDeployments } from "./project-deployment";

export const handleList = implement(listDeployments, async () => {
  const rows = await db
    .select()
    .from(_deployDeployments)
    .orderBy(asc(_deployDeployments.createdAt));
  return toDeployments(rows);
});
