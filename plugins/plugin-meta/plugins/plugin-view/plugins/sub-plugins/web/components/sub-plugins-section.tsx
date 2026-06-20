import { MdBolt } from "react-icons/md";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  CollapsibleChevron,
  useCollapsible,
} from "@plugins/primitives/plugins/collapsible/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
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
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- -mx-2 negative-bleeds the tree rows out to cancel the Section's horizontal padding so row hover backgrounds span full width */}
      <Stack direction="col" gap="none" className="-mx-2">
        {directChildren.map((c) => (
          <PluginTreeNode key={c.id} node={c} depth={0} />
        ))}
      </Stack>
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

  const chevronIcon = hasChildren ? (
    <button
      type="button"
      className="rounded-sm text-muted-foreground hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
    >
      <Center className="size-4">
        <CollapsibleChevron open={expanded} className="size-3.5" />
      </Center>
    </button>
  ) : (
    <span className="block size-4" />
  );

  return (
    <>
      <Row
        hover="accent"
        size="sm"
        indent={depth * 16 + 8}
        icon={chevronIcon}
        onClick={() =>
          openPane(pluginViewPane, { pluginId: node.id }, { mode: "swap" })
        }
        className="min-h-7 cursor-pointer"
      >
        <Text>{node.name}</Text>
        {node.loadBearing && (
          <MdBolt className="size-3 text-warning" />
        )}
      </Row>
      {expanded &&
        node.children.map((c) => (
          <PluginTreeNode key={c.id} node={c} depth={depth + 1} />
        ))}
    </>
  );
}

function countDescendants(node: PluginNode): number {
  let count = 0;
  for (const c of node.children) count += 1 + countDescendants(c);
  return count;
}
