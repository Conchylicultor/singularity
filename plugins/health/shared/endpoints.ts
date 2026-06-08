import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { HealthResponseSchema } from "./protocol";

export const getHealth = defineEndpoint({
  route: "GET /api/health",
  response: HealthResponseSchema,
});

// Readiness probe: 200 only once the `onReadyBlocking` barrier has completed
// (migrations applied, DB warm, registry built); 503 while still booting. The
// gateway polls this to gate its hot-swap, so it never swaps to a half-booted
// backend.
export const getHealthReady = defineEndpoint({
  route: "GET /api/health/ready",
});
