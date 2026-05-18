import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { hasSecret } from "@plugins/infra/plugins/secrets/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getServer } from "../../shared/endpoints";
import { _deployServers } from "./tables";

export const handleGet = implement(getServer, async ({ params }) => {
  const [row] = await db
    .select()
    .from(_deployServers)
    .where(eq(_deployServers.id, params.id));
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found");
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sshKeyConfigured: await hasSecret({ namespace: "deploy-ssh", key: row.id }),
  };
});
