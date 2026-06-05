import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { configV2ValuesSchema } from "./resource";

// One-shot snapshot of every descriptor's resolved GLOBAL (no-scope) config,
// keyed by storePath. Fetched once at boot to hydrate the client cache before
// first paint, so config reads never flash defaults and never suspend.
export const configSnapshot = defineEndpoint({
  route: "GET /api/config-v2/snapshot",
  response: z.record(configV2ValuesSchema),
});

export const setConfigField = defineEndpoint({
  route: "POST /api/config-v2/set-field",
  body: z.object({ storePath: z.string(), key: z.string(), value: z.unknown(), scopeId: z.string().optional() }),
});

export const forkScope = defineEndpoint({
  route: "POST /api/config-v2/fork-scope",
  body: z.object({ scopeId: z.string() }),
});

export const deleteScope = defineEndpoint({
  route: "POST /api/config-v2/delete-scope",
  body: z.object({ scopeId: z.string() }),
});
