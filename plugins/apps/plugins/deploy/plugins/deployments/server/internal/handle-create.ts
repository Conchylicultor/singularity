import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createDeployment } from "../../core/endpoints";
import { DEFAULT_LOOPBACK_PORT } from "../../core/derive";
import { _deployDeployments } from "./tables";
import { toDeployment } from "./project-deployment";
import { assertKnownComposition } from "./assert-known-composition";
import { rethrowConstraintViolation } from "./constraint-violation";

export const handleCreate = implement(createDeployment, async ({ body }) => {
  // Validated BEFORE the insert, so a name the user got wrong is a 400 rather
  // than a row that converge will later choke on.
  assertKnownComposition(body.compositionId);

  const id = `dpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const loopbackPort = body.loopbackPort ?? DEFAULT_LOOPBACK_PORT;

  const [row] = await db
    .insert(_deployDeployments)
    .values({
      id,
      compositionId: body.compositionId,
      serverId: body.serverId,
      // Empty is legal — an install can exist before its DNS does.
      hostnames: body.hostnames ?? [],
      loopbackPort,
    })
    .returning()
    .catch((err: unknown) => rethrowConstraintViolation(err, { loopbackPort }));
  if (!row) throw new HttpError(500, "insert returned no row");
  return toDeployment(row);
});
