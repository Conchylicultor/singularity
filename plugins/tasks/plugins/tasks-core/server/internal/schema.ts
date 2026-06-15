import { eq, getTableColumns, sql } from "drizzle-orm";
import { pgView, QueryBuilder } from "drizzle-orm/pg-core";
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

// ── Shared per-attempt derivation ───────────────────────────────────────────
// attempts_v and tasks_v both need each attempt's derived status / active. To
// keep ONE definition WITHOUT making tasks_v depend on the attempts_v VIEW, both
// views build these two grouped CTEs from the base tables and read the same
// status / active / finishedAt expressions off them.
//
// Why not let tasks_v just read attempts_v (the old design)? A view-on-view
// dependency is un-migratable under the current drizzle-kit (0.28.1): it emits
// `DROP VIEW` statements in the same order as `CREATE VIEW` (snapshot order),
// with no dependency-aware topological sort, so when both views change it tries
// to drop attempts_v before the dependent tasks_v and Postgres refuses
// ("other objects depend on it"). Deriving from base tables in both views makes
// the two views independent, so drop/create order no longer matters — while the
// shared helpers below keep the attempt-status logic defined exactly once.
//
// Set-at-a-time (one grouped scan of conversations + one of pushes, hash-joined)
// replaces the previous per-attempt correlated subqueries: proven row-for-row
// identical to the old form, ~37x fewer buffer reads for attempts_v (9.8k → 263)
// and ~28x for tasks_v (36k → 1.3k). That per-query CPU drop is what stops the
// live-state cascade fan-out from saturating the shared Postgres.
function attemptFactCtes(qb: QueryBuilder) {
  const convAgg = qb.$with("conv_agg").as(
    qb
      .select({
        attemptId: _conversations.attemptId,
        // Constant marker: present (true) iff the attempt has ≥1 conversation.
        // After a LEFT JOIN a missing row reads as NULL = "no conversation".
        hasConv: sql<boolean>`true`.as("has_conv"),
        hasLiveConv: sql<boolean>`bool_or(${_conversations.status} NOT IN ('gone', 'done'))`.as(
          "has_live_conv",
        ),
        maxEndedAt: sql<Date | null>`max(${_conversations.endedAt})`.as("max_ended_at"),
      })
      .from(_conversations)
      .groupBy(_conversations.attemptId),
  );
  const pushAgg = qb.$with("push_agg").as(
    qb
      .select({
        attemptId: pushes.attemptId,
        hasPush: sql<boolean>`true`.as("has_push"),
        minPushAt: sql<Date | null>`min(${pushes.createdAt})`.as("min_push_at"),
      })
      .from(pushes)
      .groupBy(pushes.attemptId),
  );
  return { convAgg, pushAgg };
}

type AttemptFacts = ReturnType<typeof attemptFactCtes>;

function attemptStatusSql({ convAgg, pushAgg }: AttemptFacts) {
  return sql<"pending" | "in_progress" | "pushed" | "completed" | "abandoned">`
    CASE
      WHEN ${convAgg.hasConv} IS NULL                              THEN 'pending'
      WHEN ${convAgg.hasLiveConv} AND ${pushAgg.hasPush} IS NULL    THEN 'in_progress'
      WHEN ${convAgg.hasLiveConv} AND ${pushAgg.hasPush}           THEN 'pushed'
      WHEN ${pushAgg.hasPush}                                       THEN 'completed'
      ELSE                                                               'abandoned'
    END
  `;
}

function attemptActiveSql({ convAgg }: AttemptFacts) {
  return sql<boolean>`(${convAgg.hasConv} IS NULL OR ${convAgg.hasLiveConv})`;
}

export const attempts = pgView("attempts_v").as((qb) => {
  const facts = attemptFactCtes(qb);
  const { convAgg, pushAgg } = facts;
  return qb
    .with(convAgg, pushAgg)
    .select({
      ...getTableColumns(_attempts),
      status: attemptStatusSql(facts).as("status"),
      active: attemptActiveSql(facts).as("active"),
      // finished_at is attempt-only (tasks_v derives its own), so it lives inline
      // here rather than in a shared helper.
      finishedAt: sql<Date | null>`
        CASE
          WHEN ${pushAgg.hasPush} AND NOT COALESCE(${convAgg.hasLiveConv}, false)   THEN ${pushAgg.minPushAt}
          WHEN ${convAgg.hasConv} AND NOT COALESCE(${convAgg.hasLiveConv}, false)
            AND ${pushAgg.hasPush} IS NULL                                          THEN ${convAgg.maxEndedAt}
          ELSE                                                                           NULL
        END
      `.as("finished_at"),
    })
    .from(_attempts)
    .leftJoin(convAgg, eq(convAgg.attemptId, _attempts.id))
    .leftJoin(pushAgg, eq(pushAgg.attemptId, _attempts.id));
});

// Per-task facts, same set-at-a-time approach: grouped scans hash-joined to
// tasks. `attempt_status` derives each attempt's status/active from the SAME
// shared helpers (base tables only — no attempts_v dependency); `task_completed`
// carries each task's completion AND dropped_at so the dependency-blocking
// aggregate joins it directly with no self-alias of tasks. Proven row-for-row
// identical to the old definition.
export const tasks = pgView("tasks_v").as((qb) => {
  const facts = attemptFactCtes(qb);
  const { convAgg, pushAgg } = facts;

  const attemptStatus = qb.$with("attempt_status").as(
    qb
      .select({
        taskId: _attempts.taskId,
        status: attemptStatusSql(facts).as("status"),
        active: attemptActiveSql(facts).as("active"),
      })
      .from(_attempts)
      .leftJoin(convAgg, eq(convAgg.attemptId, _attempts.id))
      .leftJoin(pushAgg, eq(pushAgg.attemptId, _attempts.id)),
  );

  const attemptAgg = qb.$with("task_attempt_agg").as(
    qb
      .select({
        taskId: attemptStatus.taskId,
        hasAttempt: sql<boolean>`true`.as("has_attempt"),
        hasCompleted: sql<boolean>`bool_or(${attemptStatus.status} = 'completed')`.as("has_completed"),
        hasActive: sql<boolean>`bool_or(${attemptStatus.active})`.as("has_active"),
      })
      .from(attemptStatus)
      .groupBy(attemptStatus.taskId),
  );

  const waiting = qb.$with("task_waiting").as(
    qb
      .select({
        taskId: _attempts.taskId,
        hasWaiting: sql<boolean>`true`.as("has_waiting"),
      })
      .from(_conversations)
      .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
      .where(sql`${_conversations.status} = 'waiting'`)
      .groupBy(_attempts.taskId),
  );

  const completedPush = qb.$with("task_completed_push").as(
    qb
      .select({
        taskId: _attempts.taskId,
        minCompletedPushAt: sql<Date | null>`min(${pushes.createdAt})`.as("min_completed_push_at"),
      })
      .from(pushes)
      .innerJoin(_attempts, eq(_attempts.id, pushes.attemptId))
      .groupBy(_attempts.taskId),
  );

  // Per-task completion + dropped flag, defaulted across ALL tasks (LEFT JOIN +
  // COALESCE) so the dependency-blocking aggregate can join it by dep id.
  const completed = qb.$with("task_completed").as(
    qb
      .select({
        id: _tasks.id,
        droppedAt: _tasks.droppedAt,
        hasCompleted: sql<boolean>`COALESCE(${attemptAgg.hasCompleted}, false)`.as("has_completed"),
      })
      .from(_tasks)
      .leftJoin(attemptAgg, eq(attemptAgg.taskId, _tasks.id)),
  );

  const blocking = qb.$with("task_blocking").as(
    qb
      .select({
        taskId: _taskDependencies.taskId,
        hasBlockingDep: sql<boolean>`bool_or(${completed.droppedAt} IS NULL AND NOT ${completed.hasCompleted})`.as(
          "has_blocking_dep",
        ),
      })
      .from(_taskDependencies)
      .innerJoin(completed, eq(completed.id, _taskDependencies.dependsOnTaskId))
      .groupBy(_taskDependencies.taskId),
  );

  const deps = qb.$with("task_deps").as(
    qb
      .select({
        taskId: _taskDependencies.taskId,
        dependencies: sql<
          string[]
        >`array_agg(${_taskDependencies.dependsOnTaskId} ORDER BY ${_taskDependencies.createdAt})`.as(
          "dependencies",
        ),
      })
      .from(_taskDependencies)
      .groupBy(_taskDependencies.taskId),
  );

  return qb
    .with(convAgg, pushAgg, attemptStatus, attemptAgg, waiting, completedPush, completed, blocking, deps)
    .select({
      ...getTableColumns(_tasks),
      status: sql<"new" | "in_progress" | "need_action" | "attempted" | "done" | "held" | "dropped" | "blocked">`
        CASE
          WHEN COALESCE(${attemptAgg.hasCompleted}, false)                  THEN 'done'
          WHEN COALESCE(${attemptAgg.hasActive}, false) AND COALESCE(${blocking.hasBlockingDep}, false)
                                                                            THEN 'blocked'
          WHEN COALESCE(${attemptAgg.hasActive}, false) AND COALESCE(${waiting.hasWaiting}, false)
                                                                            THEN 'need_action'
          WHEN COALESCE(${attemptAgg.hasActive}, false)                     THEN 'in_progress'
          WHEN ${_tasks.droppedAt} IS NOT NULL                              THEN 'dropped'
          WHEN ${_tasks.heldAt}    IS NOT NULL                              THEN 'held'
          WHEN COALESCE(${blocking.hasBlockingDep}, false)                  THEN 'blocked'
          WHEN COALESCE(${attemptAgg.hasAttempt}, false)                    THEN 'attempted'
          ELSE                                                                   'new'
        END
      `.as("status"),
      active: sql<boolean>`(
        NOT COALESCE(${attemptAgg.hasCompleted}, false)
        AND COALESCE(${attemptAgg.hasActive}, false)
      )`.as("active"),
      finishedAt: sql<Date | null>`
        CASE
          WHEN COALESCE(${attemptAgg.hasCompleted}, false)   THEN ${completedPush.minCompletedPushAt}
          WHEN ${_tasks.droppedAt} IS NOT NULL               THEN ${_tasks.droppedAt}
          ELSE                                                    NULL
        END
      `.as("finished_at"),
      dependencies: sql<string[]>`COALESCE(${deps.dependencies}, ARRAY[]::text[])`.as("dependencies"),
    })
    .from(_tasks)
    .leftJoin(attemptAgg, eq(attemptAgg.taskId, _tasks.id))
    .leftJoin(waiting, eq(waiting.taskId, _tasks.id))
    .leftJoin(completedPush, eq(completedPush.taskId, _tasks.id))
    .leftJoin(blocking, eq(blocking.taskId, _tasks.id))
    .leftJoin(deps, eq(deps.taskId, _tasks.id));
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

// List-view projection: the full task minus the heavy `description` text column
// (~60% of the bulk `tasks` live-state payload). The list never renders
// descriptions; the detail pane sources them from the per-id `task-detail`
// resource. Keeping this a distinct type makes any list consumer that reaches
// for `description` fail to compile. See
// research/2026-06-05-tasks-list-detail-payload-split.md.
export const TaskListItemSchema = TaskSchema.omit({ description: true });
export type TaskListItem = z.infer<typeof TaskListItemSchema>;

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
