import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const _claudeCliCalls = pgTable(
  "claude_cli_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    model: text("model").notNull(),
    sourceName: text("source_name").notNull(),
    sourceContext: jsonb("source_context").$type<Record<string, unknown> | null>(),
    prompt: text("prompt").notNull(),
    system: text("system"),
    output: text("output"),
    error: text("error"),
    durationMs: integer("duration_ms").notNull(),
  },
  (t) => [index("claude_cli_calls_created_at_idx").on(t.createdAt)],
);
