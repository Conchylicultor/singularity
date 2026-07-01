import { useMemo } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  PluginDetail,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import { getPluginFacetsTree } from "@plugins/plugin-meta/plugins/plugin-view/core";

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
  const { data, isLoading, error } = useEndpoint(getPluginFacetsTree, {});

  const node = useMemo(
    () => (data ? (indexNodes(data.plugins).get(pluginId) ?? null) : null),
    [data, pluginId],
  );

  return (
    <PaneChrome pane={pluginConvSidePane} title={node?.name ?? pluginId}>
      {isLoading ? (
        <Center className="h-full">
          <Loading />
        </Center>
      ) : error ? (
        <Center className="h-full p-2xl">
          <Text as="div" variant="body" tone="muted">
            {String(error)}
          </Text>
        </Center>
      ) : (
        <PluginDetail node={node} />
      )}
    </PaneChrome>
  );
}
