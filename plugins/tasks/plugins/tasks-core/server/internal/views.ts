import { eq, getTableColumns, sql } from "drizzle-orm";
import { pgView, QueryBuilder } from "drizzle-orm/pg-core";
import { _attempts, _conversations, _taskDependencies, _tasks, pushes } from "./tables";

// Derived (plain, non-materialized) views. These live in `views.ts` — NOT
// `schema.ts`/`tables.ts` — so the drizzle codegen glob never sees them: they
// are derived code rebuilt from source on every boot, declared via the `View`
// server contribution (see server/index.ts) + rebuildDerivedViews, never
// tracked in the migration chain. To change a view, edit it here and
// `./singularity build` — no migration is generated. See
// plugins/database/plugins/derived-views/CLAUDE.md.
//
// The view objects stay valid `pgView` relations so the rest of tasks-core can
// keep querying them with `db.select().from(...)`.

// ── Shared per-attempt derivation ───────────────────────────────────────────
// attempts_v and tasks_v both need each attempt's derived status / active. Both
// views build these two grouped CTEs from the base tables and read the same
// status / active / finishedAt expressions off them, so the attempt-status logic
// is defined exactly once.
//
// NOTE: these two views are currently kept INDEPENDENT (tasks_v derives attempt
// status from the base tables rather than reading attempts_v) for historical
// reasons — a view-on-view dependency used to be un-migratable under drizzle-kit
// 0.28.1, which emitted `DROP VIEW` in snapshot order with no topological sort.
// That constraint is now lifted: these views are derived code (declared via the
// `View` contribution), no longer in the migration chain, and the migration
// generator topologically
// reorders any view DROP/CREATE it does emit. tasks_v could safely read
// attempts_v again — see the follow-up to re-couple and drop the duplication.
//
// Set-at-a-time (one grouped scan of conversations + one of pushes, hash-joined)
// replaces per-attempt correlated subqueries: proven row-for-row identical to the
// old form, ~37x fewer buffer reads for attempts_v (9.8k → 263) and ~28x for
// tasks_v (36k → 1.3k). That per-query CPU drop is what stops the live-state
// cascade fan-out from saturating the shared Postgres.
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

// These view objects are declared as derived views via the `View` server
// contribution in this plugin's server barrel (server/index.ts). All three are
// currently independent (no view-on-view references); re-coupling tasks_v →
// attempts_v later is a one-line `dependsOn: ["attempts_v"]` there.
