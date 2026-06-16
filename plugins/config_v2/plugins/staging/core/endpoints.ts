import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// --- Body schemas ---

export const StageConfigDefaultBodySchema = z.object({
  pluginId: z.string().min(1), // dot-form; server derives the config storePath
  configName: z.string().min(1), // the descriptor's config name (e.g. "config")
  // The full config document (field-map object) to write to the override file,
  // loosely typed on the wire — canonical validation against the descriptor
  // schema runs at apply time so one malformed staged row never blocks others.
  value: z.unknown(),
});
export type StageConfigDefaultBody = z.infer<typeof StageConfigDefaultBodySchema>;

// --- Endpoint definitions ---

export const stageConfigDefault = defineEndpoint({
  route: "POST /api/config-v2/staged-defaults",
  body: StageConfigDefaultBodySchema,
});

export const applyConfigDefault = defineEndpoint({
  route: "POST /api/config-v2/staged-defaults/:pluginId/:configName/apply",
});

export const applyAllConfigDefaults = defineEndpoint({
  route: "POST /api/config-v2/staged-defaults/apply-all",
});

export const discardConfigDefault = defineEndpoint({
  route: "DELETE /api/config-v2/staged-defaults/:pluginId/:configName",
});

export const discardAllConfigDefaults = defineEndpoint({
  route: "DELETE /api/config-v2/staged-defaults",
});
