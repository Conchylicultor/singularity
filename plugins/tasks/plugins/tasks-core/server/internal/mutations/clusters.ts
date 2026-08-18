import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _tasks } from "../tables";
import type { DbExecutor } from "../status-batch";

// Union-find over `tasks.cluster_id`: the persisted, MONOTONE membership label
// the dependency tree renders. Two tasks are in the same tree iff they carry the
// same label. Edge creation unions; edge removal does nothing — membership grows
// and never shrinks, which is what keeps a task from vanishing from the tree when
// its last edge is detached. See
// `research/2026-08-03-tasks-monotone-deps-tree-membership.md`.

/**
 * The cluster label a task currently carries: its own `clusterId`, or its own id
 * when it has never been unioned.
 *
 * `NULL` is a total, well-defined default rather than an absorbed failure — a
 * task that was never unioned genuinely is its own singleton cluster. A missing
 * task, by contrast, is a caller bug and throws.
 *
 * A pure READ. Deliberately unlocked, so it must never be the read half of a
 * read-then-write that decides a label — a concurrent union can move the cluster
 * between the read and the write, leaving the writer's row on a label nobody
 * carries. `createTask` used to do exactly that and now calls
 * `unionTaskClusters` instead. To write a label, union.
 */
export async function clusterLabelOf(
  taskId: string,
  exec: DbExecutor = db,
): Promise<string> {
  const [row] = await exec
    .select({ id: _tasks.id, clusterId: _tasks.clusterId })
    .from(_tasks)
    .where(eq(_tasks.id, taskId))
    .limit(1);
  if (!row) throw new Error(`Task not found: ${taskId}`);
  return row.clusterId ?? taskId;
}

/**
 * Merge the clusters of `a` and `b` into one, keeping `min(label)` as the
 * survivor. Idempotent, order-independent, and a no-op when the two are already
 * in the same cluster.
 *
 * **The `FOR UPDATE` is load-bearing, not defensive.** Without it the plain
 * read-then-write loses updates at READ COMMITTED. Two concurrent unions sharing
 * one endpoint:
 *
 * ```
 * T1 union(A,B): reads labels 1,2 → UPDATE … WHERE cluster_id = 2
 * T2 union(B,C): reads labels 2,3 → UPDATE … WHERE cluster_id = 3
 * ```
 *
 * Neither statement's `WHERE` touches a row the other rewrites, so both commit
 * cleanly — and C is left stranded on label 2, a label nobody else carries any
 * more. That is the reported bug again, in a form no edge removal explains. The
 * row lock makes T2 block on B and re-read the latest committed version after T1
 * commits, so it computes `min(1,3)` against the truth.
 *
 * **`ORDER BY id`** gives the endpoint pair a consistent lock order, so two
 * transactions unioning the same pair from opposite directions queue instead of
 * deadlocking.
 *
 * **The second disjunct of the relabel** (`cluster_id IS NULL AND id IN (a,b)`)
 * materialises a never-unioned endpoint straight onto the winner. It is correct
 * precisely *because* the row is `NULL`: a `NULL` row has provably never been
 * unioned, so it is a singleton and no other row is labelled with it that would
 * also need rewriting. Folding it into the same statement keeps the hot path on
 * the plain `tasks_cluster_id_idx` rather than a `COALESCE(cluster_id, id)`
 * expression the index cannot serve.
 *
 * **Why `min` wins** — and explicitly NOT "the oldest": ids carry `task-`,
 * `claude-` and `legacy-claude-` prefixes, so lexicographic order is not
 * chronological order. `min` is chosen because it is associative and idempotent,
 * so the incremental union and a batch backfill agree by construction
 * (`min(min(A,B),C) = min(A,B,C)`), a repair pass is a no-op on already-correct
 * rows, and the label is stable under replay.
 *
 * `updatedAt` is deliberately untouched: the label is bookkeeping about the
 * cluster, not a fact about the task, and `updatedAt` is a visible sortable
 * column on the task list.
 *
 * **Handed the pool, this opens its own transaction.** A `FOR UPDATE` taken in
 * autocommit releases at statement end, so on the pool the lock-then-relabel
 * would be two independent transactions and the race above would be wide open —
 * the guarantee stated here would silently be false for exactly the callers that
 * pass no executor (`updateTask`'s folderId re-file). Rather than leave that as a
 * caller obligation nothing enforces, the primitive is correct on its own: pass a
 * `tx` to join an enclosing transaction, pass nothing and it makes one.
 */
export async function unionTaskClusters(
  a: string,
  b: string,
  exec: DbExecutor = db,
): Promise<void> {
  if (a === b) return;
  if (exec === db) {
    await db.transaction((tx) => unionOnTx(a, b, tx));
    return;
  }
  await unionOnTx(a, b, exec);
}

async function unionOnTx(
  a: string,
  b: string,
  exec: DbExecutor,
): Promise<void> {
  const rows = await exec
    .select({ id: _tasks.id, clusterId: _tasks.clusterId })
    .from(_tasks)
    .where(inArray(_tasks.id, [a, b]))
    .orderBy(asc(_tasks.id))
    .for("update");

  const rowA = rows.find((r) => r.id === a);
  const rowB = rows.find((r) => r.id === b);
  if (!rowA) throw new Error(`Task not found: ${a}`);
  if (!rowB) throw new Error(`Task not found: ${b}`);

  const la = rowA.clusterId ?? a;
  const lb = rowB.clusterId ?? b;
  if (la === lb) return;

  const winner = la < lb ? la : lb;
  const loser = la < lb ? lb : la;

  await exec
    .update(_tasks)
    .set({ clusterId: winner })
    .where(
      or(
        eq(_tasks.clusterId, loser),
        and(isNull(_tasks.clusterId), inArray(_tasks.id, [a, b])),
      ),
    );
}
