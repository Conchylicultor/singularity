import { useMemo } from "react";
import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { studioApp } from "@plugins/apps/plugins/studio/plugins/shell/core";
import { getPluginFacetsTree } from "../core";
import type { PluginNode } from "../core";
import { PluginDetail } from "./components/plugin-detail";

export const pluginViewPane = Pane.define({
  route: defineRoute({
    id: "plugin-view",
    segment: "p/:pluginId",
  }),
  app: studioApp,
  component: PluginViewBody,
  width: 600,
  useResolve: false,
  title: { useText: usePluginViewTitle, fallback: "Plugin" },
});

/** The plugin's display name from the facets tree, or undefined while it loads. */
function usePluginViewTitle({
  pluginId,
}: {
  pluginId: string;
}): string | undefined {
  const { data } = useEndpoint(getPluginFacetsTree, {});
  if (!data) return undefined;
  return findNode(data.plugins, pluginId)?.name ?? pluginId;
}

function findNode(nodes: PluginNode[], id: string): PluginNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return undefined;
}

function PluginViewBody() {
  const { pluginId } = pluginViewPane.useParams();
  const {
    data: treeData,
    isLoading,
    error,
  } = useEndpoint(getPluginFacetsTree, {});

  const indexed = useMemo(() => {
    if (!treeData) return new Map<string, PluginNode>();
    const map = new Map<string, PluginNode>();
    function visit(n: PluginNode) {
      map.set(n.id, n);
      for (const c of n.children) visit(c);
    }
    for (const p of treeData.plugins) visit(p);
    return map;
  }, [treeData]);

  const node = indexed.get(pluginId) ?? null;

  if (isLoading) {
    return (
      <PaneChrome pane={pluginViewPane}>
        <Center axis="both" className="h-full">
          <Loading />
        </Center>
      </PaneChrome>
    );
  }
  if (error) {
    return (
      <PaneChrome pane={pluginViewPane}>
        <Center axis="both" className="h-full p-2xl text-center">
          <Text as="div" variant="body">
            <Stack direction="col" align="center" gap="sm">
              <span className="font-medium text-foreground">
                Failed to load plugin tree
              </span>
              <span className="text-muted-foreground">{String(error)}</span>
            </Stack>
          </Text>
        </Center>
      </PaneChrome>
    );
  }

  return (
    <PaneChrome pane={pluginViewPane}>
      <PluginDetail node={node} />
    </PaneChrome>
  );
}
