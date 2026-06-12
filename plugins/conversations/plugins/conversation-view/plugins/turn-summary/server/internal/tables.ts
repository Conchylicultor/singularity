import { text, timestamp } from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

export const turnSummaries = defineExtension(_conversations, "turn_summary", {
  messageId: text("message_id").notNull(),
  summary: text("summary").notNull(),
  caveats: text("caveats").notNull().default(""),
  actions: text("actions").notNull().default(""),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
export const _turnSummariesTable = turnSummaries.table;
