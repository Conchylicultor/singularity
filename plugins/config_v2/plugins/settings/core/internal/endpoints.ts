import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const resetConfigField = defineEndpoint({
  route: "POST /api/config-v2/reset-field",
  body: z.object({ storePath: z.string(), key: z.string() }),
});

export const acknowledgeConflict = defineEndpoint({
  route: "POST /api/config-v2/acknowledge-conflict",
  body: z.object({ storePath: z.string() }),
});

export const deleteOverride = defineEndpoint({
  route: "POST /api/config-v2/delete-override",
  body: z.object({ storePath: z.string() }),
});

export const getConfigRawFile = defineEndpoint({
  route: "GET /api/config-v2/raw-file",
  query: z.object({ storePath: z.string() }),
  response: z.object({ origin: z.string().nullable(), override: z.string().nullable() }),
});
