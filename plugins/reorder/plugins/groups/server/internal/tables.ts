import { boolean, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { rankText } from "@plugins/primitives/plugins/rank/core";

export const _reorderGroups = pgTable(
  "reorder_groups",
  {
    id: text("id").primaryKey(),
    slotId: text("slot_id").notNull(),
    title: text("title").notNull().default("Group"),
    expanded: boolean("expanded").notNull().default(true),
    rank: rankText("rank").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("rg_slot_rank_idx").on(t.slotId, t.rank)],
);

export const _reorderGroupMembers = pgTable(
  "reorder_group_members",
  {
    slotId: text("slot_id").notNull(),
    contributionId: text("contribution_id").notNull(),
    groupId: text("group_id")
      .notNull()
      .references(() => _reorderGroups.id, { onDelete: "cascade" }),
    rank: rankText("rank").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.slotId, t.contributionId] }),
    index("rgm_group_rank_idx").on(t.groupId, t.rank),
  ],
);
