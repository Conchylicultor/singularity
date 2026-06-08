import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { pluginViewPane } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { getPluginTree } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { PluginTree } from "./plugin-tree";

export function ExplorerView() {
  const { data: treeData, isLoading, error } = useEndpoint(getPluginTree, {});

  const openPane = useOpenPane();
  const selectedId =
    pluginViewPane.useRouteEntry()?.params.pluginId ?? null;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading plugin tree…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm">
        <span className="font-medium text-foreground">
          Failed to load plugin tree
        </span>
        <span className="text-muted-foreground">{String(error)}</span>
      </div>
    );
  }

  const { plugins, totals } = treeData!;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-3">
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <Stat value={totals.plugins} label="plugins" />
          <Stat value={totals.loadBearing} label="load-bearing" />
          <Stat value={totals.umbrellas} label="umbrellas" />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <PluginTree
          plugins={plugins}
          selected={selectedId}
          onSelect={(id) => openPane(pluginViewPane, { pluginId: id }, { mode: "push" })}
        />
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <span className="font-medium text-foreground">{value}</span>{" "}
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
