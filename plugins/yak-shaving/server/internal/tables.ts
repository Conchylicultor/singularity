import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { rankText } from "@server/db/types";

// Physical tables only. Soft FKs to conversations and self (parent_node_id):
// the model curates this tree from outside the conversations lifecycle, so we
// don't want a conversation delete to ripple here, and parent edges are
// validated in code (cycles prevented at write time).

export const _yakShavingNodes = pgTable(
  "yak_shaving_nodes",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    parentNodeId: text("parent_node_id"),
    oneLineContext: text("one_line_context"),
    nextAction: text("next_action"),
    status: text("status"),
    rank: rankText("rank"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("yak_shaving_nodes_conv_idx").on(t.conversationId),
    index("yak_shaving_nodes_parent_idx").on(t.parentNodeId),
  ],
);
