import { eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import { boolean, pgView, text } from "drizzle-orm/pg-core";
import { _attempts, _conversations, _taskDependencies, _tasks, pushes } from "./tables";
import { _attemptConvAgg, _attemptPushAgg } from "./rollup-table";

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
// The two per-attempt aggregates are now read from trigger-maintained rollup
// tables (attempt_conv_agg / attempt_push_agg — see rollup-spec.ts) instead of
// the two inline CTEs that grouped over ALL conversations + ALL pushes. attempts_v
// is `bootCritical` (persisted), and the live-state runtime forces a persisted
// resource to ALWAYS FULL-recompute (no scoping), so the view re-ran on every
// fire — the full grouped scans ballooned to 8-10s under contention. The rollups
// hold the SAME aggregated columns the CTEs produced, kept current incrementally
// by STATEMENT triggers on the source tables, so the FULL recompute collapses to a
// flat LEFT JOIN over two tiny pre-rolled tables. The status / active / finished_at
// logic below is UNCHANGED — a missing rollup row reads as NULL via the LEFT JOIN,
// exactly as a missing CTE group did (preserving the pending / abandoned / active
// semantics for attempts with no conversations / pushes). tasks_v aggregates over
// attempts_v and inherits the same cheap join. See
// plugins/database/plugins/derived-tables/CLAUDE.md and the agent-launches rollup.
export const attempts = pgView("attempts_v").as((qb) => {
  return qb
    .select({
      ...getTableColumns(_attempts),
      status: sql<"pending" | "in_progress" | "pushed" | "completed" | "abandoned">`
        CASE
          WHEN ${_attemptConvAgg.hasConv} IS NULL                              THEN 'pending'
          WHEN ${_attemptConvAgg.hasLiveConv} AND ${_attemptPushAgg.hasPush} IS NULL    THEN 'in_progress'
          WHEN ${_attemptConvAgg.hasLiveConv} AND ${_attemptPushAgg.hasPush}           THEN 'pushed'
          WHEN ${_attemptPushAgg.hasPush}                                       THEN 'completed'
          ELSE                                                               'abandoned'
        END
      `.as("status"),
      active: sql<boolean>`(${_attemptConvAgg.hasConv} IS NULL OR ${_attemptConvAgg.hasLiveConv})`.as(
        "active",
      ),
      finishedAt: sql<Date | null>`
        CASE
          WHEN ${_attemptPushAgg.hasPush} AND NOT COALESCE(${_attemptConvAgg.hasLiveConv}, false)   THEN ${_attemptPushAgg.minPushAt}
          WHEN ${_attemptConvAgg.hasConv} AND NOT COALESCE(${_attemptConvAgg.hasLiveConv}, false)
            AND ${_attemptPushAgg.hasPush} IS NULL                                          THEN ${_attemptConvAgg.maxEndedAt}
          ELSE                                                                           NULL
        END
      `.as("finished_at"),
    })
    .from(_attempts)
    .leftJoin(_attemptConvAgg, eq(_attemptConvAgg.attemptId, _attempts.id))
    .leftJoin(_attemptPushAgg, eq(_attemptPushAgg.attemptId, _attempts.id));
});

// THE definition of "dependency `dep` is still blocking whatever depends on it".
//
// There are two blocking queries and they must never disagree: the transitive
// closure below (task_blocking_v, which drives the auto-start gate and the
// `blocked` badge) and the deliberately single-hop direct frontier in
// queries/tasks.ts (listBlockingDepIds, which feeds queue ranking). They differ
// in SHAPE — recursive walk vs direct edges — never in RULE, so the rule lives
// here once and both interpolate it. Parameterized by column expressions because
// the two call sites name the task table differently (a `dep` CTE alias vs the
// bare `tasks` relation).
//
// It re-derives "settled" from raw columns rather than reading `tasks_v.status`
// (tasks_v depends on this view — reading it would be circular), so it must stay
// in agreement with `isSettled` (core/task-graph.ts) and the tasks_v status CASE:
//   settled ⇔ status ∈ {done, dropped}
//   dropped ⇔ dropped_at IS NOT NULL
//   done    ⇔ has a completed attempt AND NOT held  ← hold outranks `done`
//
// That last clause is why `held_at` appears here at all. Without it, a task that
// had pushed and was then held kept the completed-attempt exemption, stopped
// blocking, and auto-launched its armed dependents — the "Hold & close marked the
// task done and started the next one" bug.
function depIsBlocking(dep: { droppedAt: SQL; heldAt: SQL; id: SQL }): SQL {
  return sql`
    ${dep.droppedAt} IS NULL
    AND (
      ${dep.heldAt} IS NOT NULL
      OR NOT EXISTS (
        SELECT 1 FROM ${attempts} att
         WHERE att.task_id = ${dep.id} AND att.status = 'completed'
      )
    )
  `;
}

// The single-hop frontier (queries/tasks.ts) interpolates the same rule against
// the bare `tasks` relation joined to the dependency edge it is walking.
export const directDepIsBlocking = (dependsOnTaskId: SQL): SQL =>
  depIsBlocking({
    droppedAt: sql`${_tasks.droppedAt}`,
    heldAt: sql`${_tasks.heldAt}`,
    id: dependsOnTaskId,
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
// activeBlockers` (core/task-graph.ts): it walks *through* settled ancestors and
// blocks on ANY non-settled one — the same rule, in both directions. The
// per-ancestor test is `depIsBlocking` above, the shared definition.
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
           bool_or(${depIsBlocking({
             droppedAt: sql`dep.dropped_at`,
             heldAt: sql`dep.held_at`,
             id: sql`dep.id`,
           })}) AS has_blocking_dep
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
      // Precedence note — `held_at` gates the `done` branch instead of sitting
      // below it. A completed attempt (= it pushed AND has no live conversation)
      // otherwise outranked an explicit hold, so "Hold & close" on a
      // conversation whose attempt had ever pushed wrote held_at, closed the
      // last live conversation, flipped the attempt `pushed` → `completed`, and
      // resolved the task to `done` — silently discarding the hold AND emitting
      // taskStatusChanged{status:'done'}, which is exactly what
      // tasks.maybe-launch-dependents fans out on, so the next task launched.
      // Hold is a user's explicit "not now": it wins over `done`.
      //
      // It stays BELOW the three `hasActive` branches, mirroring the existing
      // active-overrides-dropped rule — holding a task whose agent is still
      // running reports the live truth (`in_progress`), not the intent. This is
      // not a hole in the hold-and-exit path: that handler closes the
      // conversation, so by the time the hold is observable the task is inactive.
      status: sql<"new" | "in_progress" | "need_action" | "attempted" | "done" | "held" | "dropped" | "blocked">`
        CASE
          WHEN ${_tasks.heldAt} IS NULL AND COALESCE(${attemptAgg.hasCompleted}, false)
                                                                            THEN 'done'
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
      // Same held_at gate as the status CASE, so the two never contradict each
      // other: a task reported as `held` is not finished, and must not carry a
      // finished_at (the stats plugins read it as a completion timestamp).
      finishedAt: sql<Date | null>`
        CASE
          WHEN ${_tasks.heldAt} IS NOT NULL                  THEN NULL
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
