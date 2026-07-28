import { useCallback, useMemo } from "react";
import type { ExpandChange } from "../../core";

export type ExpandableRow = {
  id: string;
  parentId: string | null;
  expanded: boolean;
};

function subtreeWithChildren(
  rows: readonly ExpandableRow[],
  rootId: string,
): ExpandableRow[] {
  const byParent = new Map<string, ExpandableRow[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const arr = byParent.get(r.parentId) ?? [];
    arr.push(r);
    byParent.set(r.parentId, arr);
  }
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const result: ExpandableRow[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    const kids = byParent.get(id) ?? [];
    if (kids.length > 0) {
      const node = byId.get(id);
      if (node) result.push(node);
    }
    for (const k of kids) stack.push(k.id);
  }
  return result;
}

export interface UseSubtreeExpandAllReturn {
  willCollapse: boolean;
  toggle: (e?: React.MouseEvent) => Promise<void>;
}

export function useSubtreeExpandAll(
  rows: readonly ExpandableRow[],
  rootId: string,
  setExpanded: (changes: readonly ExpandChange[]) => void | Promise<void>,
): UseSubtreeExpandAllReturn {
  const nodes = useMemo(
    () => subtreeWithChildren(rows, rootId),
    [rows, rootId],
  );

  const willCollapse = nodes.length > 0 && nodes.every((n) => n.expanded);

  const toggle = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      const next = !willCollapse;
      // ONE call for the whole subtree — the reason the seam is batch-shaped.
      await setExpanded(
        nodes
          .filter((n) => n.expanded !== next)
          .map((n) => ({ id: n.id, expanded: next })),
      );
    },
    [nodes, willCollapse, setExpanded],
  );

  return { willCollapse, toggle };
}
