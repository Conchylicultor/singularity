import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const setConfigField = defineEndpoint({
  route: "POST /api/config-v2/set-field",
  body: z.object({ storePath: z.string(), key: z.string(), value: z.unknown() }),
});

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
