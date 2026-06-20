import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { deleteSecret } from "@plugins/infra/plugins/secrets/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteServer } from "../../shared/endpoints";
import { _deployServers } from "./tables";

export const handleDelete = implement(deleteServer, async ({ params }) => {
  const [row] = await db
    .delete(_deployServers)
    .where(eq(_deployServers.id, params.id))
    .returning();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found");
  await deleteSecret({ namespace: "deploy-ssh", key: params.id });
});
