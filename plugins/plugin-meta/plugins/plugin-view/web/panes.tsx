import { useMemo } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getPluginTree } from "../core/endpoints";
import type { PluginNode } from "../core/types";
import { PluginDetail } from "./components/plugin-detail";

export const pluginViewPane = Pane.define({
  id: "plugin-view",
  segment: "p/:pluginId",
  component: PluginViewBody,
  width: 600,
  resolve: false,
});

function PluginViewBody() {
  const { pluginId } = pluginViewPane.useParams();
  const { data: treeData, isLoading, error } = useEndpoint(getPluginTree, {});

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
      <PaneChrome pane={pluginViewPane} title="Plugin">
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      </PaneChrome>
    );
  }
  if (error) {
    return (
      <PaneChrome pane={pluginViewPane} title="Plugin">
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm">
          <span className="font-medium text-foreground">
            Failed to load plugin tree
          </span>
          <span className="text-muted-foreground">{String(error)}</span>
        </div>
      </PaneChrome>
    );
  }

  return (
    <PaneChrome pane={pluginViewPane} title={node?.name ?? pluginId}>
      <PluginDetail node={node} />
    </PaneChrome>
  );
}
