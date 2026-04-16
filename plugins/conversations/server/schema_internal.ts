import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { _attempts } from "@plugins/tasks/server/schema_internal";
import type { ConversationStatus } from "./status";

// Physical table. In-plugin writers import from here. Cross-plugin callers
// must never import this file — they use `./schema` (view + types).

export const _conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id")
    .notNull()
    .references(() => _attempts.id, { onDelete: "cascade" }),
  title: text("title"),
  status: text("status").$type<ConversationStatus>().notNull().default("starting"),
  runtime: text("runtime").notNull().default("tmux"),
  claudeSessionId: text("claude_session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});
