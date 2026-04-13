import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { ConversationStatus } from "../shared/types";

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  worktreePath: text("worktree_path").notNull(),
  title: text("title"),
  status: text("status").$type<ConversationStatus>().notNull().default("starting"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pushes = pgTable("pushes", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  sha: text("sha").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
