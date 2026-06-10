import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";

function countDescendants(node: PluginNode): number {
  let count = 0;
  for (const child of node.children) {
    count += 1 + countDescendants(child);
  }
  return count;
}

export function ChildCountBadge({ node }: { node: PluginNode }) {
  const count = countDescendants(node);
  if (count === 0) return null;
  return (
    <span className="hidden shrink-0 text-3xs tabular-nums text-muted-foreground group-hover/row:inline">
      {count}
    </span>
  );
}
