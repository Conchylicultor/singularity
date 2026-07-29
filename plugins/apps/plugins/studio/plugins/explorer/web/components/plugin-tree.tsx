import { useMemo } from "react";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import {
  DataView,
  defineDataView,
  type DataViewId,
  type FieldDef,
  type HierarchyConfig,
} from "@plugins/primitives/plugins/data-view/web";
import type { TreeViewOptions } from "@plugins/primitives/plugins/data-view/plugins/tree/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Explorer } from "../slots";
import {
  flattenPluginTree,
  countDescendants,
  type ExplorerRow,
} from "../internal/flatten-plugin-tree";

const EXPLORER_VIEW = defineDataView("studio.explorer.tree");

const RUNTIME_KEYS = ["web", "server", "central"] as const;

// No expand hooks. Expand/collapse is per-(surface, view-instance, row) device-
// local render state owned by the data-view primitive, so this hierarchy closes
// over nothing and is a module constant.
const hierarchy: HierarchyConfig<ExplorerRow> = {
  getParentId: (r) => r.parentId,
  getRank: (r) => r.rank,
};

interface PluginTreeProps {
  plugins: PluginNode[];
  selected: string | null;
  onSelect: (pluginId: string) => void;
  /**
   * Which surface's view/filter/sort config this tree reads and writes. Defaults
   * to the Explorer pane's own. A second surface rendering this tree MUST pass
   * its own marker — sharing one would make filtering either tree filter both.
   */
  storageKey?: DataViewId;
}

export function PluginTree({
  plugins,
  selected,
  onSelect,
  storageKey = EXPLORER_VIEW,
}: PluginTreeProps) {
  const rows = useMemo(() => flattenPluginTree(plugins), [plugins]);

  // `name` is the primary (only-rendered-in-tree) field; the rest are
  // filter-only — invisible in the tree body but usable in the "Filter" pill.
  const fields = useMemo<FieldDef<ExplorerRow>[]>(
    () => [
      { id: "name", label: "Name", primary: true, value: (r) => r.name },
      { id: "path", label: "Path", type: "text", value: (r) => r.path },
      {
        id: "description",
        label: "Description",
        type: "text",
        value: (r) => r.description ?? "",
      },
      {
        id: "loadBearing",
        label: "Load-bearing",
        type: "bool",
        value: (r) => r.loadBearing,
      },
      {
        id: "collapsed",
        label: "Collapsed",
        type: "bool",
        value: (r) => r.collapsed,
      },
      {
        id: "childCount",
        label: "Children",
        type: "number",
        value: (r) => countDescendants(r),
      },
      {
        id: "runtimes",
        label: "Runtimes",
        type: "tags",
        values: (r) => RUNTIME_KEYS.filter((k) => r.runtimes[k]),
      },
    ],
    [],
  );

  const treeOptions = useMemo<TreeViewOptions<ExplorerRow>>(
    () => ({
      expandAll: true,
      // The whole tree is expanded on first paint, matching the pre-DataView
      // behavior. Strictly better than the seed it replaces: that was a lazy
      // `useState` initializer that never re-seeded, so any node arriving after
      // the first mount stayed collapsed.
      defaultExpanded: true,
      // Both slots render a GROUP of contributions with no container of their
      // own — wrap each in a non-wrapping <Inline> so the accents / badges stay a
      // single-line cluster (the group-wrap axis, owned by container choice).
      rowAccent: (node) => (
        <Inline gap="2xs">
          <Explorer.TreeRowAccent.Render>
            {(item) => <item.component node={node} />}
          </Explorer.TreeRowAccent.Render>
        </Inline>
      ),
      trailing: (node) => (
        <Inline gap="2xs">
          <Explorer.TreeRowBadge.Render>
            {(item) => <item.component node={node} />}
          </Explorer.TreeRowBadge.Render>
        </Inline>
      ),
    }),
    [],
  );

  return (
    <DataView<ExplorerRow>
      rows={rows}
      fields={fields}
      rowKey={(r) => r.id}
      views={["tree", "table"]}
      defaultView="tree"
      storageKey={storageKey}
      hierarchy={hierarchy}
      selectedRowId={selected ?? undefined}
      onRowActivate={(r) => onSelect(r.id)}
      searchAccessor={(r) => r.searchText}
      viewOptions={{ tree: treeOptions }}
    />
  );
}
