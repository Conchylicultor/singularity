import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";

// Per-widget persistent state for active-data block tags. The card itself
// (e.g. <task>…</task>) is in immutable assistant text, so the model emits
// the "intent"; the user's follow-up action (created task, launched conv) is
// stored here keyed by the widget's stable position in the message. Cascades
// on conversation delete — we don't keep bindings for dropped conversations.
export const _activeDataBindings = pgTable(
  "active_data_bindings",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => _conversations.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    tag: text("tag").notNull(),
    occurrenceIndex: integer("occurrence_index").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.conversationId, t.messageId, t.tag, t.occurrenceIndex],
    }),
  }),
);
