import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteDeployment } from "../../core/endpoints";
import { _deployDeployments } from "./tables";

// Forgets the record only — the converged host keeps its unit, files and Caddy
// site. There is no de-converge verb yet; see the endpoint's own note.
export const handleDelete = implement(deleteDeployment, async ({ params }) => {
  const [row] = await db
    .delete(_deployDeployments)
    .where(eq(_deployDeployments.id, params.id))
    .returning();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found");
});
