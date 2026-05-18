import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const patchSlotBodySchema = z.object({
  contributionId: z.string().min(1),
  rank: z.string().min(1).optional(),
  hidden: z.boolean().optional(),
});
export type PatchSlotBody = z.infer<typeof patchSlotBodySchema>;

export const getSlot = defineEndpoint({
  route: "GET /api/reorder/:slotId",
});

export const patchSlot = defineEndpoint({
  route: "PATCH /api/reorder/:slotId",
  body: patchSlotBodySchema,
});

export const deleteContribution = defineEndpoint({
  route: "DELETE /api/reorder/:slotId/:contributionId",
});
