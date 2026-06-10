import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { pluginViewPane } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { getPluginTree } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { Text } from "@plugins/primitives/plugins/text/web";
import { PluginTree } from "./plugin-tree";

export function ExplorerView() {
  const { data: treeData, isLoading, error } = useEndpoint(getPluginTree, {});

  const openPane = useOpenPane();
  const selectedId =
    pluginViewPane.useRouteEntry()?.params.pluginId ?? null;

  if (isLoading) {
    return (
      <Text as="div" variant="body" className="flex h-full items-center justify-center text-muted-foreground">
        Loading plugin tree…
      </Text>
    );
  }
  if (error) {
    return (
      <Text as="div" variant="body" className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <span className="font-medium text-foreground">
          Failed to load plugin tree
        </span>
        <span className="text-muted-foreground">{String(error)}</span>
      </Text>
    );
  }

  const { plugins, totals } = treeData!;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-3">
        <Text as="div" variant="caption" className="flex flex-col gap-1 text-muted-foreground">
          <Stat value={totals.plugins} label="plugins" />
          <Stat value={totals.loadBearing} label="load-bearing" />
          <Stat value={totals.umbrellas} label="umbrellas" />
        </Text>
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
