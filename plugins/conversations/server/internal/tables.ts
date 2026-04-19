import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { _attempts } from "@plugins/tasks/server/internal/tables";
import type { ConversationModel } from "../model";
import type { ConversationStatus } from "../status";

// Physical table only. The cross-plugin FK target `_attempts` is imported from
// the owning plugin's leaf `internal/tables` (NOT through `server/api`) so this
// file remains a true leaf in the schema dependency graph. Going through
// `server/api` would transitively load that plugin's `internal/schema` (views),
// which back-references this table and forms an initialization cycle.
// Application code outside `internal/tables.ts` must still go through
// `@plugins/<name>/server/api`. Views, Zod schemas, and types live in
// `./schema.ts`.

export const _conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id")
    .notNull()
    .references(() => _attempts.id, { onDelete: "cascade" }),
  title: text("title"),
  status: text("status").$type<ConversationStatus>().notNull().default("starting"),
  runtime: text("runtime").notNull().default("tmux"),
  model: text("model").$type<ConversationModel>().notNull().default("opus"),
  claudeSessionId: text("claude_session_id"),
  spawnedBy: text("spawned_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});
