import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  ReorderSlotPrefsSchema,
  type ReorderSlotPrefs,
} from "../../internal/resource";
import { _reorderPrefs } from "./tables";

export const reorderPrefsResource = defineResource<
  ReorderSlotPrefs,
  { slotId: string }
>({
  key: "reorder.prefs",
  mode: "push",
  schema: ReorderSlotPrefsSchema,
  loader: async ({ slotId }): Promise<ReorderSlotPrefs> => {
    const rows = await db
      .select({
        contributionId: _reorderPrefs.contributionId,
        rank: _reorderPrefs.rank,
        hidden: _reorderPrefs.hidden,
      })
      .from(_reorderPrefs)
      .where(eq(_reorderPrefs.slotId, slotId));
    const out: ReorderSlotPrefs = {};
    for (const r of rows) {
      out[r.contributionId] = {
        rank: r.rank ? (r.rank as unknown as Rank) : undefined,
        hidden: r.hidden || undefined,
      };
    }
    return out;
  },
});
