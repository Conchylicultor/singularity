import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { rankText } from "@server/db/types";

export const _reorderPrefs = pgTable(
  "reorder_prefs",
  {
    slotId: text("slot_id").notNull(),
    contributionId: text("contribution_id").notNull(),
    rank: rankText("rank").notNull(),
  },
  (t) => [primaryKey({ columns: [t.slotId, t.contributionId] })],
);
