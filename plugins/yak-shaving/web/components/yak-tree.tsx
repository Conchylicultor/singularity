import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { buildTree } from "@plugins/tree/shared";
import {
  yakShavingCategoriesResource,
  yakShavingNodesResource,
} from "../../shared/resources";
import { YakTreeRow, type YakTreeItem } from "./yak-tree-row";

export function YakTree({ selectedConvId }: { selectedConvId?: string }) {
  const { data: nodesData } = useResource(yakShavingNodesResource);
  const { data: categoriesData } = useResource(yakShavingCategoriesResource);
  const nodes = nodesData ?? [];
  const categories = categoriesData ?? [];

  const tree = useMemo(() => {
    const items: YakTreeItem[] = [
      ...categories.map(
        (c): YakTreeItem => ({
          ...c,
          kind: "category",
          parentId: c.parentCategoryId,
          rank: c.rank ?? "",
        }),
      ),
      ...nodes.map(
        (n): YakTreeItem => ({
          ...n,
          kind: "conversation",
          parentId: n.parentCategoryId ?? n.parentNodeId,
          rank: n.rank ?? "",
        }),
      ),
    ].sort((a, b) => a.rank.localeCompare(b.rank));
    return buildTree(items);
  }, [nodes, categories]);

  if (nodes.length === 0 && categories.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-1 text-sm">No nodes yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {tree.map((node) => (
        <YakTreeRow
          key={node.id}
          node={node}
          depth={0}
          selectedConvId={selectedConvId}
        />
      ))}
    </div>
  );
}
