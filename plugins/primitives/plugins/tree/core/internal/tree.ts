import { Rank } from "@plugins/primitives/plugins/rank/core";

export type DropZone = "before" | "after" | "child";

export type TreeNode<T> = T & { children: TreeNode<T>[] };

type Node = { id: string; parentId: string | null; rank: Rank };

export function buildTree<T extends Node>(rows: readonly T[]): TreeNode<T>[] {
  const byId = new Map<string, TreeNode<T>>();
  rows.forEach((r) => byId.set(r.id, { ...r, children: [] }));
  const roots: TreeNode<T>[] = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export function isDescendant<T extends { id: string; parentId: string | null }>(
  rows: readonly T[],
  ancestorId: string,
  candidateId: string,
): boolean {
  const parents = new Map(rows.map((r) => [r.id, r.parentId] as const));
  let cur: string | null = candidateId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = parents.get(cur) ?? null;
  }
  return false;
}

/**
 * The "roots" of a selection: selected ids none of whose ancestors are also
 * selected. Bulk operations act on these; descendants follow implicitly (e.g.
 * an FK cascade on delete, or moving with their parent). Preserves the order in
 * which ids appear in `rows`.
 */
export function selectionRoots<T extends { id: string; parentId: string | null }>(
  rows: readonly T[],
  selectedIds: ReadonlySet<string>,
): string[] {
  const parents = new Map(rows.map((r) => [r.id, r.parentId] as const));
  const hasSelectedAncestor = (id: string): boolean => {
    let cur = parents.get(id) ?? null;
    const seen = new Set<string>();
    while (cur) {
      if (seen.has(cur)) return false;
      seen.add(cur);
      if (selectedIds.has(cur)) return true;
      cur = parents.get(cur) ?? null;
    }
    return false;
  };
  return rows
    .filter((r) => selectedIds.has(r.id) && !hasSelectedAncestor(r.id))
    .map((r) => r.id);
}

/**
 * All ids in `rootId`'s subtree (the root itself plus every descendant), in
 * breadth-first order. Returns `[rootId]` when the row has no children.
 */
export function subtreeIds<T extends { id: string; parentId: string | null }>(
  rows: readonly T[],
  rootId: string,
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parentId === null) continue;
    const list = childrenOf.get(r.parentId);
    if (list) list.push(r.id);
    else childrenOf.set(r.parentId, [r.id]);
  }
  const out: string[] = [];
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    const children = childrenOf.get(id);
    if (children) queue.push(...children);
  }
  return out;
}

export function computeDrop<T extends Node>(
  rows: readonly T[],
  draggedId: string,
  zone: DropZone,
  targetId: string,
): { parentId: string | null; rank: Rank } | null {
  const target = rows.find((r) => r.id === targetId);
  if (!target) return null;

  if (zone === "child") {
    const children = rows
      .filter((r) => r.parentId === target.id && r.id !== draggedId)
      .sort((a, b) => Rank.compare(a.rank, b.rank));
    const last = children[children.length - 1];
    try {
      return {
        parentId: target.id,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
        rank: Rank.between(last?.rank ?? null, null),
      };
    } catch {
      return null;
    }
  }

  const siblings = rows
    .filter((r) => r.parentId === target.parentId && r.id !== draggedId)
    .sort((a, b) => Rank.compare(a.rank, b.rank));
  const idx = siblings.findIndex((s) => s.id === target.id);
  if (idx === -1) return null;

  try {
    if (zone === "before") {
      const prev = siblings[idx - 1];
      return {
        parentId: target.parentId,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
        rank: Rank.between(prev?.rank ?? null, target.rank),
      };
    }
    const next = siblings[idx + 1];
    return {
      parentId: target.parentId,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      rank: Rank.between(target.rank, next?.rank ?? null),
    };
  } catch {
    return null;
  }
}
