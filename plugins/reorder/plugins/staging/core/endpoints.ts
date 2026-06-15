import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// --- Body schemas ---

export const StageReorderDefaultBodySchema = z.object({
  slotId: z.string().min(1),
  pluginId: z.string().min(1),
  // Materialized ReorderTree, loosely typed on the wire — canonical validation
  // against the slot's config descriptor schema runs at apply time.
  items: z.array(z.unknown()),
});
export type StageReorderDefaultBody = z.infer<typeof StageReorderDefaultBodySchema>;

// --- Endpoint definitions ---

export const stageReorderDefault = defineEndpoint({
  route: "POST /api/reorder/staged-defaults",
  body: StageReorderDefaultBodySchema,
});

export const applyReorderDefault = defineEndpoint({
  route: "POST /api/reorder/staged-defaults/:slotId/apply",
});

export const applyAllReorderDefaults = defineEndpoint({
  route: "POST /api/reorder/staged-defaults/apply-all",
});

export const discardReorderDefault = defineEndpoint({
  route: "DELETE /api/reorder/staged-defaults/:slotId",
});
