-- Custom SQL migration file, put your code below! --
-- migration: 20260803_214614__backfill_task_clusters --

-- Seed `tasks.cluster_id` from the connected components that existed before the
-- label did. Until now the dependency tree derived its member set as the live
-- connected component over dependency edges ∪ `folder_id` edges; from here the
-- set is this persisted, MONOTONE label instead (unioned on edge creation, never
-- on removal). Without this backfill every pre-existing task would boot as its
-- own singleton and every existing tree would shatter.
--
-- The label is min(id) over the component, matching `unionTaskClusters`. `min`
-- is associative and idempotent, so this batch pass and the incremental union
-- agree by construction and re-running is a no-op on already-correct rows.
--
-- `WITH RECURSIVE` alone cannot label components — the recursive term may not
-- aggregate — so this computes the full undirected reachability keyed by seed and
-- then takes min() per seed. Verified read-only against main before writing:
-- 3994 tasks → 2339 components, max size 109, 40,894 (root,node) pairs, and zero
-- edges whose two endpoints land on different labels.
--
-- `cluster_id IS NULL` guards the write so this only ever fills blanks: it must
-- never relabel a row an incremental union has already moved, and the file is
-- re-hashed and re-applied whenever its content changes.
--
-- `HAVING count(*) > 1` keeps singletons NULL. A one-member component needs no
-- label — `NULL` already means "its own cluster" to every reader (`clusterId ??
-- id`) — and `tasks` is boot-critical, shipped in the boot snapshot to every
-- tab, so a self-label on each of ~1966 singletons is pure redundancy on the
-- wire.
WITH RECURSIVE e AS (
  SELECT task_id, depends_on_task_id FROM task_dependencies
  UNION ALL SELECT depends_on_task_id, task_id FROM task_dependencies
  UNION ALL SELECT id, folder_id FROM tasks WHERE folder_id IS NOT NULL
  UNION ALL SELECT folder_id, id FROM tasks WHERE folder_id IS NOT NULL
),
reach(root, node) AS (
  SELECT id, id FROM tasks
  UNION
  SELECT r.root, e.depends_on_task_id FROM reach r JOIN e ON e.task_id = r.node
)
UPDATE tasks t SET cluster_id = c.rep
FROM (SELECT root, min(node) AS rep FROM reach GROUP BY root HAVING count(*) > 1) c
WHERE t.id = c.root AND t.cluster_id IS NULL;

-- Drop any label no other task shares — a singleton carrying a redundant
-- self-label. On a fresh database the statement above never writes one, so this
-- is a no-op there. It exists because an earlier revision of this file omitted
-- the `HAVING` and did label every singleton, and this file re-applies (with a
-- drift warning) whenever its content changes — so the correction has to be
-- expressed as SQL that converges from either starting state.
--
-- The `NOT EXISTS` is load-bearing, and the cheaper `cluster_id = id` would be
-- WRONG: the representative of a genuine multi-member cluster is by construction
-- the member whose label IS its own id, so that predicate would strip the label
-- off the head of every real cluster and shatter it.
UPDATE tasks t SET cluster_id = NULL
WHERE t.cluster_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM tasks o WHERE o.id <> t.id AND o.cluster_id = t.cluster_id
  );

-- Restore the task from the bug report that prompted this change.
--
-- The backfill above labels from LIVE connectivity, so it cannot recover this
-- one: the drag already removed its only edge, and it has no folder, so it reads
-- as a genuine singleton. Re-file it into the cluster it was dragged out of, as a
-- parallel root — which is what should have happened at the time.
--
-- Consistent with the union rule: the merged set is {…481403, …481584,
-- …065107}, whose min is `task-1785768481403-9x8sex`, so this is exactly the
-- label a union would have produced.
--
-- ORDER MATTERS: this must run after the singleton-clearing statement above.
-- The first revision of this file put the `IS NULL` guard here while the
-- backfill still labelled every singleton, so by the time this ran the guard was
-- already false and the repair silently did nothing. Keep it last.
--
-- `IS NULL` is the right guard rather than a no-op safeguard: it means "only if
-- this task is still stranded alone", so the statement correctly does nothing if
-- the task has since been re-linked by hand or by a union.
UPDATE tasks SET cluster_id = (
  SELECT COALESCE(cluster_id, id) FROM tasks WHERE id = 'task-1785768481403-9x8sex'
)
WHERE id = 'task-1785768481584-u01k0k' AND cluster_id IS NULL;
