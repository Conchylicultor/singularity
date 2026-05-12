import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

export const ReorderSlotPrefsSchema = z.record(
  z.string(),
  z.object({ rank: RankSchema.optional(), hidden: z.boolean().optional() }),
);
export type ReorderSlotPrefs = z.infer<typeof ReorderSlotPrefsSchema>;

export const reorderPrefsResource = resourceDescriptor<
  ReorderSlotPrefs,
  { slotId: string }
>("reorder.prefs", ReorderSlotPrefsSchema, {});
