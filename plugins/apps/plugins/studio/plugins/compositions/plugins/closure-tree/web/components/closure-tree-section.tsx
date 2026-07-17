import type { ReactElement } from "react";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getPluginTree } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { pluginViewPane } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { PluginTree } from "@plugins/apps/plugins/studio/plugins/explorer/web";
import { defineDataView } from "@plugins/primitives/plugins/data-view/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";

// Marker scraped by codegen (data-views.generated.ts). Must live in web/**, and
// must be declared HERE rather than reusing the Explorer's `studio.explorer.tree`
// — sharing that key would make filtering the Explorer silently filter this
// closure. Codegen attributes the marker to the defining plugin, which is what
// puts the views config under this plugin's own path.
const CLOSURE_TREE_VIEW = defineDataView("studio.compositions.closure-tree");

/**
 * The active composition's closure as a tinted plugin tree. The tint itself is
 * contributed by `explorer/membership` into the `Explorer.TreeRowAccent` slot
 * that `PluginTree` renders, painted off the same active-composition store this
 * pane seeds — so there is deliberately no tinting logic here.
 */
export function ClosureTreeSection(): ReactElement {
  const { data, isLoading, error } = useEndpoint(getPluginTree, {});
  const openPane = useOpenPane();
  const selected = pluginViewPane.useRouteEntry()?.params.pluginId ?? null;

  if (isLoading) return <Loading label="Loading plugin tree…" />;
  if (error) {
    return (
      <Stack gap="2xs">
        <Text variant="body" className="font-medium text-foreground">
          Failed to load plugin tree
        </Text>
        <Text variant="body" tone="muted">
          {String(error)}
        </Text>
      </Stack>
    );
  }

  // Bounded: unbounded, the full tree dwarfs every sibling section.
  return (
    <Scroll axis="y" className="max-h-[60vh]">
      <PluginTree
        plugins={data!.plugins}
        storageKey={CLOSURE_TREE_VIEW}
        selected={selected}
        onSelect={(pluginId) =>
          openPane(pluginViewPane, { pluginId }, { mode: "push", side: "right" })
        }
      />
    </Scroll>
  );
}
