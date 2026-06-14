import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { z } from "zod";

// `items` is kept loosely typed here on purpose: canonical ReorderTree
// validation runs at *apply* time (against the slot's config descriptor schema),
// so one malformed staged row never blanks the whole resource.
export const StagedReorderDefaultSchema = z.object({
  slotId: z.string(),
  pluginId: z.string(),
  items: z.array(z.unknown()),
  authorId: z.string().nullable(),
  updatedAt: z.coerce.date(),
});
export type StagedReorderDefault = z.infer<typeof StagedReorderDefaultSchema>;

export const stagedReorderDefaultsResource = resourceDescriptor<StagedReorderDefault[]>(
  "reorder-staged-defaults",
  z.array(StagedReorderDefaultSchema),
  [],
);
