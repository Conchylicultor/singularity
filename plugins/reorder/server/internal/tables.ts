import { boolean, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { rankText } from "@plugins/primitives/plugins/rank/shared";

export const _reorderPrefs = pgTable(
  "reorder_prefs",
  {
    slotId: text("slot_id").notNull(),
    contributionId: text("contribution_id").notNull(),
    rank: rankText("rank"),
    hidden: boolean("hidden").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.slotId, t.contributionId] })],
);
