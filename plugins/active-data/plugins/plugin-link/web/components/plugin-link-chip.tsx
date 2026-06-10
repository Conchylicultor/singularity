import { useMemo } from "react";
import { MdWidgets } from "react-icons/md";
import { pluginIdSegments } from "@plugins/framework/plugins/plugin-id/core";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { LinkChip } from "@plugins/primitives/plugins/link-chip/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { pluginViewPane } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { getPluginTree } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { pluginConvSidePane } from "../panes";

interface PluginIndex {
  byId: Map<string, PluginNode>;
  bySegment: Map<string, PluginNode[]>;
}

function indexNodes(
  nodes: PluginNode[],
  index: PluginIndex = { byId: new Map(), bySegment: new Map() },
): PluginIndex {
  for (const node of nodes) {
    index.byId.set(node.id, node);
    const seg = pluginIdSegments(node.id).pop()!;
    const arr = index.bySegment.get(seg);
    if (arr) arr.push(node);
    else index.bySegment.set(seg, [node]);
    indexNodes(node.children, index);
  }
  return index;
}

export function PluginLinkChip({
  content,
}: {
  content: string;
  attrs: Record<string, string>;
}) {
  const id = content.trim();
  const convId = conversationPane.useRouteEntry()?.params.convId ?? null;
  const openPane = useOpenPane();

  const { data } = useEndpoint(getPluginTree, {});

  const index = useMemo(
    () => (data ? indexNodes(data.plugins) : undefined),
    [data],
  );

  const node = useMemo(() => {
    if (!index) return undefined;
    const exact = index.byId.get(id);
    if (exact) return exact;
    // Fuzzy: if the input matches exactly one plugin's last segment, use it.
    const candidates = index.bySegment.get(id);
    return candidates?.length === 1 ? candidates[0] : undefined;
  }, [index, id]);

  // Not a known plugin (or still loading) — preserve the original code appearance.
  if (!node) {
    return (
      <code
        // eslint-disable-next-line text/no-adhoc-typography -- mono inline-code size matching markdown code base style
        className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs"
      >
        {id}
      </code>
    );
  }

  const resolvedId = node.id;

  return (
    <LinkChip
      onClick={(e) => {
        e.stopPropagation();
        if (convId) {
          openPane(pluginConvSidePane, { convId, pluginId: resolvedId }, { mode: "push" });
        } else {
          openPane(pluginViewPane, { pluginId: resolvedId }, { mode: "push" });
        }
      }}
      title={node.description ?? resolvedId}
      leading={<MdWidgets className="shrink-0 text-muted-foreground" />}
      mono
    >
      {id}
    </LinkChip>
  );
}
