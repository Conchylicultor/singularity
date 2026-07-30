import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { runDeployment } from "../../core/endpoints";
import { _deployDeployments } from "./tables";
import { toDeployment } from "./project-deployment";
import { startDeployRun } from "./run-deploy";

/**
 * Launch `converge` / `ship` for one deployment.
 *
 * The row is read (not trusted from the body) because the CLI's arguments — the
 * composition name and the server id — ARE the row's identity, so a caller can
 * only name a deployment, never a pair. Everything after the spawn is the CLI's:
 * this handler owns exactly the 404 and the 409.
 */
export const handleRun = implement(runDeployment, async ({ params, body }) => {
  const [row] = await db
    .select()
    .from(_deployDeployments)
    .where(eq(_deployDeployments.id, params.id));
  if (!row) throw new HttpError(404, "Not found");

  return startDeployRun({ deployment: toDeployment(row), body });
});
