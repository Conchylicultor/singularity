import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { z } from "zod";

// `value` is the full config document (a field-map object), kept loosely typed
// here on purpose: canonical validation against the descriptor schema runs at
// *apply* time, so one malformed staged row never blanks the whole resource.
export const StagedConfigDefaultSchema = z.object({
  pluginId: z.string(),
  configName: z.string(),
  value: z.unknown(),
  authorId: z.string().nullable(),
  updatedAt: z.coerce.date(),
});
export type StagedConfigDefault = z.infer<typeof StagedConfigDefaultSchema>;

export const stagedConfigDefaultsResource = resourceDescriptor<StagedConfigDefault[]>(
  "config-v2-staged-defaults",
  z.array(StagedConfigDefaultSchema),
  [],
);
