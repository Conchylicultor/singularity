import { MdUnfoldLess, MdUnfoldMore } from "react-icons/md";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { usePluginTree } from "@plugins/apps/plugins/forge/plugins/publish/web";

function collectSubtreeIds(node: PluginNode): string[] {
  const ids: string[] = [];
  if (node.children.length > 0) {
    ids.push(node.id);
    for (const child of node.children) {
      ids.push(...collectSubtreeIds(child));
    }
  }
  return ids;
}

export function ExpandCollapseButton({ node }: { node: PluginNode }) {
  const { expanded, expandDescendants, collapseDescendants } = usePluginTree();
  if (node.children.length === 0) return null;

  const subtreeIds = collectSubtreeIds(node);
  const allExpanded = subtreeIds.every((id) => expanded.has(id));

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (allExpanded) collapseDescendants(node);
        else expandDescendants(node);
      }}
      aria-label={allExpanded ? "Collapse all" : "Expand all"}
      className="hidden size-4 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted-foreground/10 group-hover/row:inline-flex"
    >
      {allExpanded ? (
        <MdUnfoldLess className="size-3" />
      ) : (
        <MdUnfoldMore className="size-3" />
      )}
    </button>
  );
}
