import { MdBolt } from "react-icons/md";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  CollapsibleChevron,
  useCollapsible,
} from "@plugins/primitives/plugins/collapsible/web";
import {
  Section,
  type PluginNode,
  pluginViewPane,
} from "@plugins/plugin-meta/plugins/plugin-view/web";

export function SubPluginsSection({ node }: { node: PluginNode }) {
  const directChildren = node.children;
  if (directChildren.length === 0) return null;

  const totalDescendants = countDescendants(node);

  return (
    <Section
      title="Sub-plugins"
      count={
        totalDescendants > directChildren.length
          ? `${directChildren.length} direct · ${totalDescendants} total`
          : `${directChildren.length}`
      }
    >
      <div className="-mx-2 flex flex-col">
        {directChildren.map((c) => (
          <PluginTreeNode key={c.hierarchyId} node={c} depth={0} />
        ))}
      </div>
    </Section>
  );
}

function PluginTreeNode({
  node,
  depth,
}: {
  node: PluginNode;
  depth: number;
}) {
  const { open: expanded, toggle } = useCollapsible();
  const openPane = useOpenPane();
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        className="group flex min-h-7 cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-sm hover:bg-accent"
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() =>
          openPane(pluginViewPane, { pluginId: node.hierarchyId }, { mode: "swap" })
        }
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
          >
            <CollapsibleChevron open={expanded} className="size-3.5" />
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
        {node.loadBearing && (
          <MdBolt className="size-3 shrink-0 text-warning" />
        )}
      </div>
      {expanded &&
        node.children.map((c) => (
          <PluginTreeNode key={c.hierarchyId} node={c} depth={depth + 1} />
        ))}
    </>
  );
}

function countDescendants(node: PluginNode): number {
  let count = 0;
  for (const c of node.children) count += 1 + countDescendants(c);
  return count;
}
