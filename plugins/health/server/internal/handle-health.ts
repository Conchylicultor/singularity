import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getHealth } from "../../shared/endpoints";
import type { HealthResponse } from "../../shared/protocol";

const startedAt = Date.now();

export const handleHealth = implement(getHealth, () => {
  return { ok: true, startedAt } satisfies HealthResponse;
});
