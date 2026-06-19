import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { pluginViewPane } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { getPluginTree } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { PluginTree } from "./plugin-tree";

export function ExplorerView() {
  const { data: treeData, isLoading, error } = useEndpoint(getPluginTree, {});

  const openPane = useOpenPane();
  const selectedId =
    pluginViewPane.useRouteEntry()?.params.pluginId ?? null;

  if (isLoading) {
    return (
      <Center axis="both" className="h-full">
        <Loading label="Loading plugin tree…" />
      </Center>
    );
  }
  if (error) {
    return (
      <Center axis="both" className="h-full p-2xl">
        <Stack gap="sm" align="center" className="text-center">
          <Text variant="body" className="font-medium text-foreground">
            Failed to load plugin tree
          </Text>
          <Text variant="body" tone="muted">
            {String(error)}
          </Text>
        </Stack>
      </Center>
    );
  }

  const { plugins, totals } = treeData!;

  return (
    <Column
      fill
      className="h-full"
      scrollBody={false}
      header={
        <div className="border-b px-lg py-md">
          <Stack gap="xs">
            <Stat value={totals.plugins} label="plugins" />
            <Stat value={totals.loadBearing} label="load-bearing" />
            <Stat value={totals.umbrellas} label="umbrellas" />
          </Stack>
        </div>
      }
      body={
        <PluginTree
          plugins={plugins}
          selected={selectedId}
          onSelect={(id) => openPane(pluginViewPane, { pluginId: id }, { mode: "push" })}
        />
      }
    />
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Text variant="caption" as="div">
      <span className="font-medium text-foreground">{value}</span>{" "}
      <span className="text-muted-foreground">{label}</span>
    </Text>
  );
}
