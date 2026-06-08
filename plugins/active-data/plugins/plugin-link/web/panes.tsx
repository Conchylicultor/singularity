import { useMemo } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  PluginDetail,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import { getPluginTree } from "@plugins/plugin-meta/plugins/plugin-view/core";

export const pluginConvSidePane = Pane.define({
  id: "plugin-conv-side",
  segment: "plugin/:pluginId",
  component: PluginConvSideBody,
  width: 600,
  chrome: { history: false },
  resolve: false,
});

function indexNodes(nodes: PluginNode[], map = new Map<string, PluginNode>()) {
  for (const node of nodes) {
    map.set(node.id, node);
    indexNodes(node.children, map);
  }
  return map;
}

function PluginConvSideBody() {
  const { pluginId } = pluginConvSidePane.useParams();
  const { data, isLoading, error } = useEndpoint(getPluginTree, {});

  const node = useMemo(
    () => (data ? (indexNodes(data.plugins).get(pluginId) ?? null) : null),
    [data, pluginId],
  );

  return (
    <PaneChrome pane={pluginConvSidePane} title={node?.name ?? pluginId}>
      {isLoading ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : error ? (
        <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
          {String(error)}
        </div>
      ) : (
        <PluginDetail node={node} />
      )}
    </PaneChrome>
  );
}
