import { TaskGraph, type TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";

/**
 * The unified member set both trees in the deps-tree section render — the same
 * set, organized two ways (by dependency, by creation).
 *
 * It is the connected component of `rootId` over BOTH relations at once:
 *
 *   - dependency edges (`task_dependencies`), followed in both directions —
 *     blockers AND dependents, so a whole runs-after chain stays together;
 *   - creation edges (`folderId`, "created under"), followed both ways too — a
 *     task's creator (parent) AND the tasks it created (children) — so two
 *     otherwise-independent tasks are pulled in together when one created the
 *     other.
 *
 * The one guard that keeps this bounded: `containerIds` — the system meta/bucket
 * tasks (Improvements, Reports, Conversations, …). Those hold hundreds of
 * unrelated tasks, so we never traverse creation edges THROUGH them: a container
 * is never added as a creator-parent, and a container's children are never
 * fanned in. Without this a single `folderId` hop into a bucket would drag the
 * whole task tree into the cluster. (Dependency edges are always followed;
 * buckets have none.)
 *
 * Returns the member ids including `rootId`; empty when `rootId` is unknown.
 */
export function taskClusterIds(
  tasks: readonly TaskListItem[],
  rootId: string,
  containerIds: ReadonlySet<string>,
): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t] as const));
  if (!byId.has(rootId)) return new Set();

  const graph = TaskGraph.from(tasks);

  // Reverse creation adjacency: parent id → its direct children (creator → created).
  const childrenOf = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.folderId && byId.has(t.folderId)) {
      const list = childrenOf.get(t.folderId);
      if (list) list.push(t.id);
      else childrenOf.set(t.folderId, [t.id]);
    }
  }

  const members = new Set<string>([rootId]);
  const stack: string[] = [rootId];
  const visit = (id: string | null | undefined) => {
    if (!id || members.has(id) || !byId.has(id)) return;
    members.add(id);
    stack.push(id);
  };

  while (stack.length) {
    const cur = stack.pop()!;
    // Dependency neighbours — both directions, always.
    for (const n of graph.directDependencies(cur)) visit(n.id);
    for (const n of graph.directDependents(cur)) visit(n.id);
    // Creator (folder parent) — up one hop, unless the creator is a bucket.
    const parent = byId.get(cur)?.folderId ?? null;
    if (parent && !containerIds.has(parent)) visit(parent);
    // Created (folder children) — down, unless THIS node is a bucket.
    if (!containerIds.has(cur)) {
      for (const c of childrenOf.get(cur) ?? []) visit(c);
    }
  }
  return members;
}
