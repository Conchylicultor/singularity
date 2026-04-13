import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const ConversationStatusSchema = z.enum([
  "starting",
  "working",
  "needs_attention",
  "completed",
  "obsolete",
]);
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  worktreePath: text("worktree_path").notNull(),
  title: text("title"),
  status: text("status").$type<ConversationStatus>().notNull().default("starting"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ConversationSchema = createSelectSchema(conversations, {
  status: ConversationStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const pushes = pgTable("pushes", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  sha: text("sha").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
