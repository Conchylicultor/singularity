import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const configV2ValuesSchema = z.record(z.unknown());
export type ConfigV2Values = z.infer<typeof configV2ValuesSchema>;

export const configV2Resource = resourceDescriptor<ConfigV2Values, { path: string }>(
  "config-v2.values",
  configV2ValuesSchema,
  {},
);

export const configV2ConflictEntrySchema = z.object({
  originValues: z.record(z.unknown()),
});
export const configV2ConflictsSchema = z.record(configV2ConflictEntrySchema);
export type ConfigV2Conflicts = z.infer<typeof configV2ConflictsSchema>;

export const configV2ConflictsResource = resourceDescriptor<ConfigV2Conflicts>(
  "config-v2.conflicts",
  configV2ConflictsSchema,
  {},
);
