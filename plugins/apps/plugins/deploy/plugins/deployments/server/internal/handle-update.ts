import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { updateDeployment } from "../../core/endpoints";
import { _deployDeployments } from "./tables";
import { toDeployment } from "./project-deployment";
import { rethrowConstraintViolation } from "./constraint-violation";

export const handleUpdate = implement(updateDeployment, async ({ params, body }) => {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.hostnames !== undefined) updates.hostnames = body.hostnames;
  if (body.loopbackPort !== undefined) updates.loopbackPort = body.loopbackPort;

  // No `compositionId` / `serverId` branch on purpose — that pair is the
  // deployment's identity. See `UpdateDeploymentBodySchema`.
  const [row] = await db
    .update(_deployDeployments)
    .set(updates)
    .where(eq(_deployDeployments.id, params.id))
    .returning()
    .catch((err: unknown) =>
      rethrowConstraintViolation(err, { loopbackPort: body.loopbackPort }),
    );
  if (!row) throw new HttpError(404, "Not found");
  return toDeployment(row);
});
