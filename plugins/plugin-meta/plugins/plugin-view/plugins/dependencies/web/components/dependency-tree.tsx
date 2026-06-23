import { useMemo } from "react";
import { pluginIdSegments } from "@plugins/framework/plugins/plugin-id/core";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  CollapsibleChevron,
  useCollapsible,
} from "@plugins/primitives/plugins/collapsible/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  useGraph,
  useEnsureCompositionData,
} from "@plugins/plugin-meta/plugins/composition/web";
import {
  Section,
  type PluginNode,
  pluginViewPane,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import {
  buildDepTree,
  type DepDirection,
  type DepTreeNode,
} from "../internal/build-dep-tree";

const TITLE: Record<DepDirection, string> = {
  deps: "Depends on",
  dependents: "Used by",
};

const EMPTY: Record<DepDirection, string> = {
  deps: "No dependencies.",
  dependents: "Nothing depends on this.",
};

export function DependsOnSection({ node }: { node: PluginNode }) {
  return <DependencySection node={node} direction="deps" />;
}

export function UsedBySection({ node }: { node: PluginNode }) {
  return <DependencySection node={node} direction="dependents" />;
}

function DependencySection({
  node,
  direction,
}: {
  node: PluginNode;
  direction: DepDirection;
}) {
  useEnsureCompositionData();
  const graph = useGraph();

  const tree = useMemo(
    () => (graph ? buildDepTree(graph, node.id, direction) : null),
    [graph, node.id, direction],
  );

  if (!graph || !tree) {
    return (
      <Section title={TITLE[direction]}>
        <Loading />
      </Section>
    );
  }

  if (tree.total === 0) {
    return (
      <Section title={TITLE[direction]}>
        <Text tone="muted">{EMPTY[direction]}</Text>
      </Section>
    );
  }

  return (
    <Section title={TITLE[direction]} count={String(tree.total)}>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- -mx-2 negative-bleeds the tree rows out to cancel the Section's horizontal padding so row hover backgrounds span full width */}
      <Stack direction="col" gap="none" className="-mx-2">
        {tree.roots.map((root, i) => (
          <DepRow key={`${root.id}-${i}`} node={root} depth={0} />
        ))}
      </Stack>
    </Section>
  );
}

function DepRow({ node, depth }: { node: DepTreeNode; depth: number }) {
  const { open: expanded, toggle } = useCollapsible();
  const openPane = useOpenPane();
  const hasChildren = node.children.length > 0 && !node.duplicate;
  const segs = pluginIdSegments(node.id);
  const label = segs[segs.length - 1] ?? String(node.id);

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
        title={String(node.id)}
      >
        <Text>{label}</Text>
        {node.kind === "soft" && <Badge variant="info">soft</Badge>}
        {node.duplicate && (
          <Text tone="muted" title="already shown above">
            ↑
          </Text>
        )}
      </Row>
      {expanded &&
        hasChildren &&
        node.children.map((c, i) => (
          <DepRow key={`${c.id}-${i}`} node={c} depth={depth + 1} />
        ))}
    </>
  );
}
