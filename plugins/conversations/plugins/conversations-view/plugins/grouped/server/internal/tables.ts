import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { rankText } from "@plugins/primitives/plugins/rank/shared";
import { _conversations } from "@plugins/tasks-core/server";

// User-defined groupings shown in the conversation sidebar list. Each
// conversation can be a member of at most one group (PK on conversation_id).
// Groups persist even when empty — the user explicitly removes them.
export const _conversationGroups = pgTable("conversation_groups", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  expanded: boolean("expanded").notNull().default(true),
  rank: rankText("rank").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const _conversationGroupMembers = pgTable(
  "conversation_group_members",
  {
    conversationId: text("conversation_id")
      .primaryKey()
      .references(() => _conversations.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => _conversationGroups.id, { onDelete: "cascade" }),
    rank: rankText("rank").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("cgm_group_rank_idx").on(t.groupId, t.rank)],
);
