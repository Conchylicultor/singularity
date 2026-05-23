import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

const secretMetaValueSchema = z.object({
  set: z.boolean(),
  updatedAt: z.number().optional(),
});

export const configV2SecretMetaSchema = z.record(secretMetaValueSchema);
export type ConfigV2SecretMeta = z.infer<typeof configV2SecretMetaSchema>;

export const configV2SecretMetaResource = resourceDescriptor<ConfigV2SecretMeta, { path: string }>(
  "config-v2.secret-meta",
  configV2SecretMetaSchema,
  {},
);
