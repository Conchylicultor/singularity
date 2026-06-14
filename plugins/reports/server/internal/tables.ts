import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// One row per (fingerprint, worktree). Upserts atomically dedupe repeats:
// first report inserts + creates a task; repeats bump count and advance
// last_seen_at. See research/2026-04-21-global-crashes-plugin.md.
//
// `kind` discriminates the event type and is fully generic — the reports engine
// never names a kind. Each kind contributes a ReportKindSpec (schema +
// fingerprint + meta + renderTask) and stores its per-kind payload in the
// generic `data` jsonb column; the validated payload shape is owned by the
// kind, not this table.
export const _reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull().default("crash"),
    fingerprint: text("fingerprint").notNull(),
    worktree: text("worktree").notNull(),
    source: text("source").notNull(),
    // Generic one-line summary shown in lists / notifications. Kind-specific
    // detail lives in `data`.
    message: text("message").notNull(),
    url: text("url"),
    userAgent: text("user_agent"),
    // The kind's validated payload. Each ReportKindSpec.schema owns this shape;
    // the engine persists whatever the schema parses without inspecting it.
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    count: integer("count").notNull().default(1),
    // Generic velocity state: set when this fingerprint fired faster than the
    // velocity window allows; while set, recordReport stops churning the task
    // and skips the resource notify. (Was `crash_loop`.)
    rateLimited: boolean("rate_limited").notNull().default(false),
    noise: boolean("noise").notNull().default(false),
    // Attribution (last-writer-wins): the tab + bundle build id of the most
    // recent report for this fingerprint. NOT part of the dedup key.
    lastClientId: text("last_client_id"),
    lastBuildId: text("last_build_id"),
    // Soft reference to tasks.id — the cross-plugin FK would cross a plugin
    // boundary, so we validate integrity in code via getTask() instead. A
    // deleted task just surfaces as `needsTask` on the next report.
    taskId: text("task_id"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("reports_fingerprint_worktree_idx").on(t.fingerprint, t.worktree),
    index("reports_task_id_idx").on(t.taskId),
  ],
);
