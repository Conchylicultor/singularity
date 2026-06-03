import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

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
