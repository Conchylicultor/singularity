import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { TASK_LATEST_CONVERSATION_TABLE } from "@plugins/database/plugins/derived-views/core";

// Drizzle READ handle for the `task_latest_conversation` rollup — the latest
// non-system conversation per task. The agent-launches loader queries it.
//
// This lives in a NON-glob file (NOT `tables.ts`/`schema.ts`) so the drizzle
// codegen glob (`**/internal/{schema,tables}{,-*}.ts`) never sees it: the table
// is DERIVED state, created imperatively on boot by `rebuildDerivedTables` (via
// the `DerivedTable` contribution / `rollup-spec.ts`), NOT tracked in the
// migration chain — same reason plain views live in `views.ts`. If a migration
// is ever generated for this table, it was put in a glob file by mistake.
export const _task_latest_conversation = pgTable(TASK_LATEST_CONVERSATION_TABLE, {
  taskId: text("task_id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  title: text("title"),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
