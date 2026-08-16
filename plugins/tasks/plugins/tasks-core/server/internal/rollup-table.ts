import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import {
  ATTEMPT_CONV_AGG_TABLE,
  ATTEMPT_PUSH_AGG_TABLE,
} from "@plugins/database/plugins/derived-views/core";

// Drizzle READ handles for the two trigger-maintained rollups backing
// `attempts_v`: the per-attempt conversation aggregate and push aggregate.
// `views.ts` LEFT JOINs these in place of the old inline `conv_agg` / `push_agg`
// CTEs (see rollup-spec.ts for the maintenance DDL).
//
// These live in a NON-glob file (NOT `tables.ts`/`schema.ts`) so the drizzle
// codegen glob (`**/internal/{schema,tables}{,-*}.ts`) never sees them: the
// tables are DERIVED state, created imperatively on boot by `rebuildDerivedTables`
// (via the `DerivedTable` contributions / `rollup-spec.ts`), NOT tracked in the
// migration chain — same reason plain views live in `views.ts`. If a migration is
// ever generated for these tables, they were put in a glob file by mistake.
export const _attemptConvAgg = pgTable(ATTEMPT_CONV_AGG_TABLE, {
  attemptId: text("attempt_id").primaryKey(),
  hasConv: boolean("has_conv").notNull(),
  // PROGRESS notion: `status NOT IN ('gone','done')` — a process is expected to
  // be running. Feeds attempts_v.status and attempts_v.active (DISPLAY only).
  hasLiveConv: boolean("has_live_conv"),
  // RETENTION notion: `status <> 'done'` — the user has not explicitly finished
  // with it, so its worktree/DB are still theirs. Feeds attempts_v.retained.
  // Every DESTRUCTIVE consumer reads this one, never hasLiveConv: `gone` is the
  // state a conversation must be in to be RESUMABLE, so it is not terminal.
  // See rollup-spec.ts for the full rationale.
  hasOpenConv: boolean("has_open_conv"),
  maxEndedAt: timestamp("max_ended_at", { withTimezone: true }),
});

export const _attemptPushAgg = pgTable(ATTEMPT_PUSH_AGG_TABLE, {
  attemptId: text("attempt_id").primaryKey(),
  hasPush: boolean("has_push").notNull(),
  minPushAt: timestamp("min_push_at", { withTimezone: true }),
});
