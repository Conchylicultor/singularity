import { index, pgTable, pgView, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { eq, getTableColumns, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { _conversations } from "@plugins/conversations/server/schema_internal";
import { _attempts, _tasks } from "./schema_internal";

// Public surface for this plugin: views (derived) + plain tables with no
// derivation (e.g. pushes) + Zod + types. In-plugin writers of the derived
// tables (_tasks, _attempts) go through ./schema_internal.

export const pushes = pgTable(
  "pushes",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => _attempts.id, { onDelete: "cascade" }),
    // Soft attribution to the conversation that ran the push (cross-plugin,
    // no FK so the conversations table can own its own lifecycle).
    conversationId: text("conversation_id"),
    sha: text("sha").notNull(),
    pushId: text("push_id").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("pushes_sha_unique").on(t.sha),
    index("pushes_push_id_idx").on(t.pushId),
    index("pushes_attempt_id_idx").on(t.attemptId),
  ],
);

export const attempts = pgView("attempts_v").as((qb) => {
  const facts = qb.$with("attempt_facts").as(
    qb
      .select({
        id: _attempts.id,
        hasConv: sql<boolean>`EXISTS (
          SELECT 1 FROM ${_conversations} c WHERE c.attempt_id = ${sql.raw('"attempts"."id"')}
        )`.as("has_conv"),
        hasLiveConv: sql<boolean>`EXISTS (
          SELECT 1 FROM ${_conversations} c
           WHERE c.attempt_id = ${sql.raw('"attempts"."id"')} AND c.status <> 'gone'
        )`.as("has_live_conv"),
        hasPush: sql<boolean>`EXISTS (
          SELECT 1 FROM ${pushes} p WHERE p.attempt_id = ${sql.raw('"attempts"."id"')}
        )`.as("has_push"),
        minPushAt: sql<
          Date | null
        >`(SELECT MIN(p.created_at) FROM ${pushes} p WHERE p.attempt_id = ${sql.raw('"attempts"."id"')})`.as(
          "min_push_at",
        ),
        maxEndedAt: sql<
          Date | null
        >`(SELECT MAX(c.ended_at) FROM ${_conversations} c WHERE c.attempt_id = ${sql.raw('"attempts"."id"')})`.as(
          "max_ended_at",
        ),
      })
      .from(_attempts),
  );

  return qb
    .with(facts)
    .select({
      ...getTableColumns(_attempts),
      status: sql<
        "pending" | "in_progress" | "pushed" | "completed" | "abandoned"
      >`
        CASE
          WHEN NOT ${facts.hasConv}                                       THEN 'pending'
          WHEN ${facts.hasLiveConv} AND NOT ${facts.hasPush}               THEN 'in_progress'
          WHEN ${facts.hasLiveConv} AND ${facts.hasPush}                   THEN 'pushed'
          WHEN ${facts.hasPush}                                            THEN 'completed'
          ELSE                                                                  'abandoned'
        END
      `.as("status"),
      active: sql<boolean>`((NOT ${facts.hasConv}) OR ${facts.hasLiveConv})`.as("active"),
      finishedAt: sql<Date | null>`
        CASE
          WHEN ${facts.hasPush} AND NOT ${facts.hasLiveConv}               THEN ${facts.minPushAt}
          WHEN ${facts.hasConv} AND NOT ${facts.hasLiveConv}
            AND NOT ${facts.hasPush}                                       THEN ${facts.maxEndedAt}
          ELSE                                                                  NULL
        END
      `.as("finished_at"),
    })
    .from(_attempts)
    .innerJoin(facts, eq(facts.id, _attempts.id));
});

// Tasks view reads the `attempts` view so the derivation rides the same
// `status` / `active` definitions. Postgres inlines tier-A views where
// possible; promote either to materialized if measurement shows it's needed.
export const tasks = pgView("tasks_v").as((qb) => {
  const facts = qb.$with("task_facts").as(
    qb
      .select({
        id: _tasks.id,
        hasAttempt: sql<boolean>`EXISTS (
          SELECT 1 FROM ${_attempts} a WHERE a.task_id = ${sql.raw('"tasks"."id"')}
        )`.as("has_attempt"),
        hasCompleted: sql<boolean>`EXISTS (
          SELECT 1 FROM ${attempts} a
           WHERE a.task_id = ${sql.raw('"tasks"."id"')} AND a.status = 'completed'
        )`.as("has_completed"),
        hasActive: sql<boolean>`EXISTS (
          SELECT 1 FROM ${attempts} a
           WHERE a.task_id = ${sql.raw('"tasks"."id"')} AND a.active
        )`.as("has_active"),
        minCompletedPushAt: sql<Date | null>`(
          SELECT MIN(p.created_at)
            FROM ${pushes} p
            JOIN ${_attempts} a ON a.id = p.attempt_id
           WHERE a.task_id = ${sql.raw('"tasks"."id"')}
        )`.as("min_completed_push_at"),
      })
      .from(_tasks),
  );

  return qb
    .with(facts)
    .select({
      ...getTableColumns(_tasks),
      status: sql<"new" | "in_progress" | "attempted" | "done" | "dropped">`
        CASE
          WHEN ${_tasks.droppedAt} IS NOT NULL   THEN 'dropped'
          WHEN ${facts.hasCompleted}             THEN 'done'
          WHEN ${facts.hasActive}                THEN 'in_progress'
          WHEN ${facts.hasAttempt}               THEN 'attempted'
          ELSE                                        'new'
        END
      `.as("status"),
      active: sql<boolean>`(
        ${_tasks.droppedAt} IS NULL
        AND NOT ${facts.hasCompleted}
        AND ${facts.hasActive}
      )`.as("active"),
      finishedAt: sql<Date | null>`
        CASE
          WHEN ${_tasks.droppedAt} IS NOT NULL   THEN ${_tasks.droppedAt}
          WHEN ${facts.hasCompleted}             THEN ${facts.minCompletedPushAt}
          ELSE                                        NULL
        END
      `.as("finished_at"),
    })
    .from(_tasks)
    .innerJoin(facts, eq(facts.id, _tasks.id));
});

export const TaskStatusSchema = z.enum([
  "new",
  "in_progress",
  "attempted",
  "done",
  "dropped",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const AttemptStatusSchema = z.enum([
  "pending",
  "in_progress",
  "pushed",
  "completed",
  "abandoned",
]);
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>;

export const TaskSchema = createSelectSchema(_tasks, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  droppedAt: z.coerce.date().nullable(),
}).extend({
  status: TaskStatusSchema,
  active: z.boolean(),
  finishedAt: z.coerce.date().nullable(),
});
export type Task = z.infer<typeof TaskSchema>;

export const AttemptSchema = createSelectSchema(_attempts, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
}).extend({
  status: AttemptStatusSchema,
  active: z.boolean(),
  finishedAt: z.coerce.date().nullable(),
});
export type Attempt = z.infer<typeof AttemptSchema>;

export const PushSchema = createSelectSchema(pushes, {
  createdAt: z.coerce.date(),
});
export type Push = z.infer<typeof PushSchema>;
