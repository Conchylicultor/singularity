import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getDeployment } from "../../core/endpoints";
import { _deployDeployments } from "./tables";
import { toDeployment } from "./project-deployment";

export const handleGet = implement(getDeployment, async ({ params }) => {
  const [row] = await db
    .select()
    .from(_deployDeployments)
    .where(eq(_deployDeployments.id, params.id));
  if (!row) throw new HttpError(404, "Not found");
  return toDeployment(row);
});
