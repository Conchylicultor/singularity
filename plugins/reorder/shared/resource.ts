import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export const ReorderSlotPrefsSchema = z.record(
  z.string(),
  z.object({ rank: z.string() }),
);
export type ReorderSlotPrefs = z.infer<typeof ReorderSlotPrefsSchema>;

export const reorderPrefsResource = resourceDescriptor<
  ReorderSlotPrefs,
  { slotId: string }
>("reorder.prefs", ReorderSlotPrefsSchema);
