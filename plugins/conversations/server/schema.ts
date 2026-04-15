import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { taskAttempts } from "@plugins/tasks/server/schema";

export const ConversationStatusSchema = z.enum([
  "starting",
  "working",
  "needs_attention",
  "completed",
  "gone",
  "abandoned",
]);
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;

export const TERMINAL_STATUSES = ["completed", "gone", "abandoned"] as const;
export function isActiveStatus(status: ConversationStatus): boolean {
  return !(TERMINAL_STATUSES as readonly string[]).includes(status);
}

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  worktreePath: text("worktree_path").notNull(),
  title: text("title"),
  status: text("status").$type<ConversationStatus>().notNull().default("starting"),
  runtime: text("runtime").notNull().default("tmux"),
  claudeSessionId: text("claude_session_id"),
  taskAttemptId: text("task_attempt_id").references(() => taskAttempts.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const ConversationSchema = createSelectSchema(conversations, {
  status: ConversationStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
}).transform((row) => ({ ...row, active: isActiveStatus(row.status) }));
export type Conversation = z.infer<typeof ConversationSchema>;

export const pushes = pgTable(
  "pushes",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    sha: text("sha").notNull(),
    pushId: text("push_id").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("pushes_sha_unique").on(t.sha),
    index("pushes_push_id_idx").on(t.pushId),
  ],
);
