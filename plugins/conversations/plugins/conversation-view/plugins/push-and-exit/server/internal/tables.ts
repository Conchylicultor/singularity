import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Mirror of the `JobState` discriminant in shared/resources.ts, inlined here
// so tables.ts stays free of any cross-module imports (drizzle-kit loads this
// file outside the Bun runtime — see server/CLAUDE.md §"Schema change workflow").
type Status = "running" | "clean" | "flag" | "error";

// One row per conversation; PRIMARY KEY on conversation_id gives us
// "one push-and-exit in flight per conversation" for free. `detail` holds
// the flag text when status=flag and the error message when status=error
// (both variants never coexist on a single row). Row is cleared by the
// DELETE route after the UI has read a terminal state.
export const _pushAndExitJobs = pgTable("push_and_exit_jobs", {
  conversationId: text("conversation_id").primaryKey(),
  status: text("status").$type<Status>().notNull(),
  detail: text("detail"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
