import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import {
  parsedJson,
  parsedText,
} from "@plugins/database/plugins/sql-column/server";
import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";
import {
  CliAnswerSchema,
  RelayQuestionsSchema,
  RelayStateSchema,
} from "../../core/schemas";

// One row per AskUserQuestion call a relay hook held, keyed by the CLI's
// tool-use id (unique per call, and what the relay re-registers under after a
// backend restart). `state` is the lifecycle in core/schemas.ts; `answer` is
// set with `answered`, in the tool's own input shape. The row is only the early
// copy of the question: once the CLI writes the tool_use and its result, the
// transcript is the authority.
export const _pendingQuestions = pgTable(
  "pending_questions",
  {
    toolUseId: text("tool_use_id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => _conversations.id, { onDelete: "cascade" }),
    questions: parsedJson("questions", RelayQuestionsSchema).notNull(),
    // The relay process holding the call; a dead pid is how a hold the
    // terminal killed (Escape, a dead agent or pane) is noticed.
    relayPid: integer("relay_pid").notNull(),
    state: parsedText("state", RelayStateSchema).notNull(),
    answer: parsedJson("answer", CliAnswerSchema),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    // The reconciler's "latest hold per conversation" read, and the web's
    // per-conversation window.
    index("pending_questions_conversation_idx").on(
      t.conversationId,
      t.createdAt,
    ),
    // The retention sweep's age column.
    index("pending_questions_resolved_at_idx").on(t.resolvedAt),
  ],
);
