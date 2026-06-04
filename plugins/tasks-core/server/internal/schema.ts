import { eq, getTableColumns, sql } from "drizzle-orm";
import { pgView } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { _attempts, _conversations, _taskDependencies, _tasks, pushes } from "./tables";
import { StoredModelSchema } from "@plugins/conversations/plugins/model-provider/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import { ConversationStatusSchema } from "../../core/conversation-status";

// Derived views + Zod schemas + types. All tables live in `./tables.ts` so
// this file can import them without any cross-plugin dependency, eliminating
// the cycle that previously existed between tasks/schema and
// conversations/tables.

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
           WHERE c.attempt_id = ${sql.raw('"attempts"."id"')} AND c.status NOT IN ('gone', 'done')
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
// `status` / `active` definitions.
export const tasks = pgView("tasks_v").as((qb) => {
  // Per-task "has a completed attempt", computed once over all tasks. It is
  // referenced by both task_facts.hasCompleted and the has_blocking_dep
  // dependency join, so Postgres auto-materializes it — the attempts_v status
  // re-derivation runs once per task instead of once per dependency. Previously
  // has_blocking_dep re-derived attempts_v inside a per-dependency anti-join
  // (and, being referenced twice by the status CASE below, ran it twice),
  // scanning ~1.3M rows per evaluation on every notifyConversationsChanged.
  // Drizzle 0.36.4 can't emit the MATERIALIZED keyword, but multi-reference
  // auto-materialization yields the same plan.
  const completed = qb.$with("task_completed").as(
    qb
      .select({
        id: _tasks.id,
        hasCompleted: sql<boolean>`EXISTS (
          SELECT 1 FROM ${attempts} a
           WHERE a.task_id = ${sql.raw('"tasks"."id"')} AND a.status = 'completed'
        )`.as("has_completed"),
      })
      .from(_tasks),
  );

  const facts = qb.$with("task_facts").as(
    qb
      .select({
        id: _tasks.id,
        hasAttempt: sql<boolean>`EXISTS (
          SELECT 1 FROM ${_attempts} a WHERE a.task_id = ${sql.raw('"tasks"."id"')}
        )`.as("has_attempt"),
        hasCompleted: sql<boolean>`${completed.hasCompleted}`.as("has_completed"),
        hasActive: sql<boolean>`EXISTS (
          SELECT 1 FROM ${attempts} a
           WHERE a.task_id = ${sql.raw('"tasks"."id"')} AND a.active
        )`.as("has_active"),
        hasWaiting: sql<boolean>`EXISTS (
          SELECT 1 FROM ${_conversations} c
            JOIN ${_attempts} a ON a.id = c.attempt_id
           WHERE a.task_id = ${sql.raw('"tasks"."id"')} AND c.status = 'waiting'
        )`.as("has_waiting"),
        minCompletedPushAt: sql<Date | null>`(
          SELECT MIN(p.created_at)
            FROM ${pushes} p
            JOIN ${_attempts} a ON a.id = p.attempt_id
           WHERE a.task_id = ${sql.raw('"tasks"."id"')}
        )`.as("min_completed_push_at"),
        // Reuses the precomputed per-task completion (dtc) instead of
        // re-deriving attempts_v.status='completed' for every dependency.
        hasBlockingDep: sql<boolean>`EXISTS (
          SELECT 1 FROM ${_taskDependencies} td
            JOIN ${_tasks} dep ON dep.id = td.depends_on_task_id
            JOIN ${completed} dtc ON dtc.id = dep.id
           WHERE td.task_id = ${sql.raw('"tasks"."id"')}
             AND dep.dropped_at IS NULL
             AND NOT dtc.has_completed
        )`.as("has_blocking_dep"),
      })
      .from(_tasks)
      .innerJoin(completed, eq(completed.id, _tasks.id)),
  );

  return qb
    .with(completed, facts)
    .select({
      ...getTableColumns(_tasks),
      status: sql<"new" | "in_progress" | "need_action" | "attempted" | "done" | "held" | "dropped" | "blocked">`
        CASE
          WHEN ${facts.hasCompleted}                        THEN 'done'
          WHEN ${facts.hasActive} AND ${facts.hasBlockingDep}
                                                           THEN 'blocked'
          WHEN ${facts.hasActive} AND ${facts.hasWaiting}   THEN 'need_action'
          WHEN ${facts.hasActive}                           THEN 'in_progress'
          WHEN ${_tasks.droppedAt} IS NOT NULL              THEN 'dropped'
          WHEN ${_tasks.heldAt}    IS NOT NULL              THEN 'held'
          WHEN ${facts.hasBlockingDep}                      THEN 'blocked'
          WHEN ${facts.hasAttempt}                          THEN 'attempted'
          ELSE                                                   'new'
        END
      `.as("status"),
      active: sql<boolean>`(
        NOT ${facts.hasCompleted}
        AND ${facts.hasActive}
      )`.as("active"),
      finishedAt: sql<Date | null>`
        CASE
          WHEN ${facts.hasCompleted}             THEN ${facts.minCompletedPushAt}
          WHEN ${_tasks.droppedAt} IS NOT NULL   THEN ${_tasks.droppedAt}
          ELSE                                        NULL
        END
      `.as("finished_at"),
      dependencies: sql<string[]>`COALESCE(ARRAY(
        SELECT td.depends_on_task_id FROM ${_taskDependencies} td
         WHERE td.task_id = ${sql.raw('"tasks"."id"')}
         ORDER BY td.created_at
      ), ARRAY[]::text[])`.as("dependencies"),
    })
    .from(_tasks)
    .innerJoin(facts, eq(facts.id, _tasks.id));
});

// Conversation view adds derived fields from the attempt join.
export const conversations = pgView("conversations_v").as((qb) =>
  qb
    .select({
      ...getTableColumns(_conversations),
      worktreePath: _attempts.worktreePath,
      taskId: _attempts.taskId,
      active: sql<boolean>`(${_conversations.status} <> 'done')`.as("active"),
    })
    .from(_conversations)
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId)),
);

export const TaskStatusSchema = z.enum([
  "new",
  "in_progress",
  "need_action",
  "attempted",
  "done",
  "held",
  "dropped",
  "blocked",
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

export const ConversationKindSchema = z.enum(["user", "agent", "system"]);
export type ConversationKind = z.infer<typeof ConversationKindSchema>;

export const TaskSchema = createSelectSchema(_tasks, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  droppedAt: z.coerce.date().nullable(),
  heldAt: z.coerce.date().nullable(),
  rank: RankSchema,
}).extend({
  status: TaskStatusSchema,
  active: z.boolean(),
  finishedAt: z.coerce.date().nullable(),
  dependencies: z.array(z.string()),
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

export const ConversationSchema = createSelectSchema(_conversations, {
  status: ConversationStatusSchema,
  // Tolerant by construction (see StoredModelSchema): a legacy/unknown stored
  // model (e.g. written by a concurrent worktree on pre-flatten code, or an id
  // later removed from the registry) normalizes to a concrete model instead of
  // rejecting the row — which would blank the whole conversationsResource array.
  model: StoredModelSchema,
  kind: ConversationKindSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
}).extend({
  worktreePath: z.string(),
  taskId: z.string(),
  active: z.boolean(),
});
export type Conversation = z.infer<typeof ConversationSchema>;
