import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";

// A turn the user sent while its conversation was still `starting`, kept until
// the agent can take it (held-turns.ts). A row exists ONLY while the turn is
// undelivered: whichever delivery path hands it to the agent deletes it.
//
// `text` is what the agent is given (attachment refs already resolved to
// `@<disk-path>`, trimmed — the endpoint's `resolvedText`); `raw_text` is the
// body as posted, which `conversation.userTurnSent` carries once delivered.
//
// `created_at` is `clock_timestamp()`, not `now()`: the accept inserts AFTER
// taking the conversation row lock, so the wall clock at insert time follows
// the lock order — the order the user's turns were accepted in. `now()` is
// transaction START time, and a transaction that waited on the lock could carry
// an earlier stamp than the one it waited behind.
export const _heldTurns = pgTable(
  "conversation_held_turns",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => _conversations.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    rawText: text("raw_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`clock_timestamp()`)
      .notNull(),
  },
  (t) => [
    // Every read is "this conversation's held turns, oldest first".
    index("conversation_held_turns_conversation_idx").on(
      t.conversationId,
      t.createdAt,
    ),
  ],
);
