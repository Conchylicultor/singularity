import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const patchConfigBodySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});
export type PatchConfigBody = z.infer<typeof patchConfigBodySchema>;

export const getConfig = defineEndpoint({
  route: "GET /api/config",
});

export const getConfigSpecs = defineEndpoint({
  route: "GET /api/config/specs",
});

export const patchConfig = defineEndpoint({
  route: "PATCH /api/config",
  body: patchConfigBodySchema,
});

export const deleteConfig = defineEndpoint({
  route: "DELETE /api/config/:key",
});
