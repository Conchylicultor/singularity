import { useCallback, useMemo, useState } from "react";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import {
  DataView,
  defineDataView,
  type FieldDef,
  type HierarchyConfig,
} from "@plugins/primitives/plugins/data-view/web";
import type { TreeViewOptions } from "@plugins/primitives/plugins/data-view/plugins/tree/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Explorer } from "../slots";
import { PluginTreeProvider } from "../context";
import {
  flattenPluginTree,
  countDescendants,
  type ExplorerRow,
} from "../internal/flatten-plugin-tree";

const EXPLORER_VIEW = defineDataView("studio.explorer.tree");

const RUNTIME_KEYS = ["web", "server", "central"] as const;

function collectAllExpandableIds(nodes: PluginNode[]): Set<string> {
  const set = new Set<string>();
  function walk(ns: PluginNode[]) {
    for (const n of ns) {
      if (n.children.length > 0) {
        set.add(n.id);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return set;
}

function collectSubtreeIds(node: PluginNode): string[] {
  const ids: string[] = [];
  if (node.children.length > 0) {
    ids.push(node.id);
    for (const child of node.children) {
      ids.push(...collectSubtreeIds(child));
    }
  }
  return ids;
}

interface PluginTreeProps {
  plugins: PluginNode[];
  selected: string | null;
  onSelect: (pluginId: string) => void;
}

export function PluginTree({ plugins, selected, onSelect }: PluginTreeProps) {
  // Host-owned expand state — all expandable ids initially, matching the
  // pre-DataView behavior (everything expanded on first paint).
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    collectAllExpandableIds(plugins),
  );

  const toggle = useCallback(
    (id: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  const expandDescendants = useCallback(
    (node: PluginNode) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of collectSubtreeIds(node)) next.add(id);
        return next;
      }),
    [],
  );

  const collapseDescendants = useCallback(
    (node: PluginNode) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of collectSubtreeIds(node)) next.delete(id);
        return next;
      }),
    [],
  );

  const ctxValue = useMemo(
    () => ({ expanded, toggle, expandDescendants, collapseDescendants }),
    [expanded, toggle, expandDescendants, collapseDescendants],
  );

  const rows = useMemo(() => flattenPluginTree(plugins), [plugins]);

  const hierarchy = useMemo<HierarchyConfig<ExplorerRow>>(
    () => ({
      getParentId: (r) => r.parentId,
      getRank: (r) => r.rank,
      isExpanded: (r) => expanded.has(r.id),
      onToggleExpanded: (id, next) =>
        setExpanded((prev) => {
          const set = new Set(prev);
          if (next) set.add(id);
          else set.delete(id);
          return set;
        }),
    }),
    [expanded],
  );

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
      rowAccent: (node) => (
        <Explorer.TreeRowAccent.Render>
          {(item) => <item.component node={node} />}
        </Explorer.TreeRowAccent.Render>
      ),
      trailing: (node) => (
        <Explorer.TreeRowBadge.Render>
          {(item) => <item.component node={node} />}
        </Explorer.TreeRowBadge.Render>
      ),
    }),
    [],
  );

  return (
    <PluginTreeProvider value={ctxValue}>
      <Column
        fill
        className="h-full"
        scrollBody={false}
        body={
          <DataView<ExplorerRow>
            rows={rows}
            fields={fields}
            rowKey={(r) => r.id}
            views={["tree", "table"]}
            defaultView="tree"
            storageKey={EXPLORER_VIEW}
            hierarchy={hierarchy}
            selectedRowId={selected ?? undefined}
            onRowActivate={(r) => onSelect(r.id)}
            searchAccessor={(r) => r.searchText}
            viewOptions={{ tree: treeOptions }}
          />
        }
      />
    </PluginTreeProvider>
  );
}
