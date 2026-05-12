import { rankText } from "@plugins/primitives/plugins/rank/core";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { _conversations } from "@plugins/tasks-core/server";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const conversationsQueue = defineExtension(_conversations, "queue", {
  rank: rankText("rank").notNull(),
});
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
export const _conversationsQueueTable = conversationsQueue.table;

export const _queueState = pgTable("queue_state", {
  id: text("id").primaryKey(),
  pinnedConversationId: text("pinned_conversation_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
