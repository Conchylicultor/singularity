import { index } from "drizzle-orm/pg-core";
import {
  defineEntity,
  defaultNow,
  defaultRandom,
} from "@plugins/infra/plugins/entities/server";
import { claudeCliCallFields } from "../../core";

// Durable recent-call log for one-shot `claude --print` invocations. The table
// and the `ClaudeCliCall` wire schema both derive from the single
// `claudeCliCallFields` record (core), so a column/schema drift is
// unrepresentable. Trimmed to the most recent N rows after every insert.
const claudeCliCalls = defineEntity("claude_cli_calls", claudeCliCallFields, {
  primaryKey: "id",
  columns: {
    id: { default: defaultRandom() },
    createdAt: { default: defaultNow() },
  },
  indexes: (t) => [index("claude_cli_calls_created_at_idx").on(t.createdAt)],
});

// drizzle-kit schema-glob discovery. Name kept so consumers don't churn.
export const _claudeCliCalls = claudeCliCalls.table;
