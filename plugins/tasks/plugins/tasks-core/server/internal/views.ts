import { eq, getTableColumns, sql } from "drizzle-orm";
import { boolean, pgView, text } from "drizzle-orm/pg-core";
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
//
// attempts_v is the single definition of each attempt's derived status / active.
// tasks_v reads attempts_v (declared `dependsOn: ["attempts_v"]` in
// server/index.ts; the boot rebuild creates/drops them in dependency order) so
// attempt status is defined exactly once rather than re-derived from the base
// tables in both views. This view-on-view coupling used to be un-migratable
// under drizzle-kit (it dropped views in snapshot, not dependency, order); that
// constraint is gone now that plain views are derived code.
//
// Set-at-a-time (one grouped scan of conversations + one of pushes, hash-joined)
// replaces per-attempt correlated subqueries: ~37x fewer buffer reads for
// attempts_v (9.8k → 263) and ~50x for tasks_v (36k → 717). That per-query CPU
// drop is what stops the live-state cascade fan-out from saturating the shared
// Postgres. tasks_v aggregating over attempts_v inlines to the same grouped-scan
// plan (plain views + single-reference CTEs are folded by the planner), so the
// win is preserved.
export const attempts = pgView("attempts_v").as((qb) => {
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
  return qb
    .with(convAgg, pushAgg)
    .select({
      ...getTableColumns(_attempts),
      status: sql<"pending" | "in_progress" | "pushed" | "completed" | "abandoned">`
        CASE
          WHEN ${convAgg.hasConv} IS NULL                              THEN 'pending'
          WHEN ${convAgg.hasLiveConv} AND ${pushAgg.hasPush} IS NULL    THEN 'in_progress'
          WHEN ${convAgg.hasLiveConv} AND ${pushAgg.hasPush}           THEN 'pushed'
          WHEN ${pushAgg.hasPush}                                       THEN 'completed'
          ELSE                                                               'abandoned'
        END
      `.as("status"),
      active: sql<boolean>`(${convAgg.hasConv} IS NULL OR ${convAgg.hasLiveConv})`.as("active"),
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

// Transitive dependency-blocking, computed once as a shared derived view so the
// auto-start gate (hasBlockingDep) and the UI status badge (tasks_v) read the
// SAME definition instead of mirroring two single-hop queries. A task is blocked
// iff ANY task in its transitive dependency closure is unresolved — neither
// dropped nor backed by a completed attempt.
//
// Single-hop was only ever correct because completion propagates bottom-up: a
// task can't complete until its own deps resolved, so "direct dep done" implied
// "its ancestors done". `drop` breaks that invariant — it makes a node
// non-blocking WITHOUT resolving the node's own deps, punching a hole that a
// single JOIN can't see (A → B → C: dropping B unblocked C even with A pending).
// The recursive walk over depends_on edges closes the hole; UNION dedupes so
// cycles (already barred on insert by taskDependsOn) still terminate. Tasks with
// no dependencies produce no row — consumers COALESCE the absence to "not
// blocked".
//
// This recursive CTE is the SQL embodiment of `isSettled` / `TaskGraph.
// activeBlockers` (core/task-graph.ts): it walks *through* settled (dropped or
// completed) ancestors and blocks on ANY non-settled one — the same rule, in
// both directions. It cannot read `tasks_v.status` to define "settled" because
// tasks_v depends on this view (circular), so it re-derives settled from the raw
// columns (`dropped_at IS NULL AND NOT EXISTS(completed attempt)`); both
// definitions must stay in agreement.
export const taskBlocking = pgView("task_blocking_v", {
  taskId: text("task_id").notNull(),
  hasBlockingDep: boolean("has_blocking_dep").notNull(),
}).as(
  sql`
    WITH RECURSIVE ancestors AS (
      SELECT td.task_id AS task_id, td.depends_on_task_id AS ancestor_id
        FROM ${_taskDependencies} td
      UNION
      SELECT a.task_id, td.depends_on_task_id
        FROM ancestors a
        JOIN ${_taskDependencies} td ON td.task_id = a.ancestor_id
    )
    SELECT a.task_id AS task_id,
           bool_or(
             dep.dropped_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM ${attempts} att
                WHERE att.task_id = dep.id AND att.status = 'completed'
             )
           ) AS has_blocking_dep
      FROM ancestors a
      JOIN ${_tasks} dep ON dep.id = a.ancestor_id
     GROUP BY a.task_id
  `,
);

// Per-task facts, same set-at-a-time approach: grouped scans hash-joined to
// tasks. `task_attempt_agg` aggregates each attempt's status/active straight off
// attempts_v (the single definition — no re-derivation here); transitive
// dependency-blocking is read from the shared task_blocking_v view.
export const tasks = pgView("tasks_v").as((qb) => {
  const attemptAgg = qb.$with("task_attempt_agg").as(
    qb
      .select({
        taskId: attempts.taskId,
        hasAttempt: sql<boolean>`true`.as("has_attempt"),
        hasCompleted: sql<boolean>`bool_or(${attempts.status} = 'completed')`.as("has_completed"),
        hasActive: sql<boolean>`bool_or(${attempts.active})`.as("has_active"),
      })
      .from(attempts)
      .groupBy(attempts.taskId),
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
    .with(attemptAgg, waiting, completedPush, deps)
    .select({
      ...getTableColumns(_tasks),
      status: sql<"new" | "in_progress" | "need_action" | "attempted" | "done" | "held" | "dropped" | "blocked">`
        CASE
          WHEN COALESCE(${attemptAgg.hasCompleted}, false)                  THEN 'done'
          WHEN COALESCE(${attemptAgg.hasActive}, false) AND COALESCE(${taskBlocking.hasBlockingDep}, false)
                                                                            THEN 'blocked'
          WHEN COALESCE(${attemptAgg.hasActive}, false) AND COALESCE(${waiting.hasWaiting}, false)
                                                                            THEN 'need_action'
          WHEN COALESCE(${attemptAgg.hasActive}, false)                     THEN 'in_progress'
          WHEN ${_tasks.droppedAt} IS NOT NULL                              THEN 'dropped'
          WHEN ${_tasks.heldAt}    IS NOT NULL                              THEN 'held'
          WHEN COALESCE(${taskBlocking.hasBlockingDep}, false)                  THEN 'blocked'
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
    .leftJoin(taskBlocking, eq(taskBlocking.taskId, _tasks.id))
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
// contribution in this plugin's server barrel (server/index.ts). tasks_v
// declares `dependsOn: ["attempts_v"]` there; conversations_v is independent.
