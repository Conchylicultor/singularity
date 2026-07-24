import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getServer } from "../../shared/endpoints";
import { _deployServers } from "./tables";
import { toServer } from "./project-server";

export const handleGet = implement(getServer, async ({ params }) => {
  const [row] = await db
    .select()
    .from(_deployServers)
    .where(eq(_deployServers.id, params.id));
  if (!row) throw new HttpError(404, "Not found");
  return toServer(row);
});
