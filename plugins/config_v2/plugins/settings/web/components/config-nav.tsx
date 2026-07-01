import { useCallback, useMemo, useState } from "react";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getPluginTree } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import type { ConfigRegistration } from "@plugins/config_v2/web";
import {
  configV2ConflictPathsResource,
  configV2ModifiedCountsResource,
} from "@plugins/config_v2/core";
import {
  DataView,
  defineDataView,
  type FieldDef,
  type HierarchyConfig,
} from "@plugins/primitives/plugins/data-view/web";
import type { TreeViewOptions } from "@plugins/primitives/plugins/data-view/plugins/tree/web";
import { configDetailPane } from "../internal/panes";
import { pruneConfigTree } from "../internal/prune-config-tree";
import { flattenConfigTree, type ConfigNavRow } from "../internal/flatten-config-tree";
import { ConfigRowBadge } from "./config-row-badge";

const CONFIG_NAV_VIEW = defineDataView("config_v2.settings.nav");

export function ConfigNav() {
  const registrations = useConfigRegistrations();
  const openPane = useOpenPane();
  // Collapsed group ids — a row is expanded unless its id is present. Starts
  // empty (everything expanded), matching the pre-DataView nav.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data: payload, isPending } = useEndpoint(getPluginTree, {});

  // Modified/conflict state, read once data-level (no per-row config hooks).
  // While a resource is still loading we report "not modified / no conflict" —
  // the badge simply doesn't paint yet, exactly as the per-row hook behaved.
  const modifiedRes = useResource(configV2ModifiedCountsResource, {});
  const conflictRes = useResource(configV2ConflictPathsResource, {});

  // Keyed by the canonical DOT-form plugin id. `reg.pluginId` is already dot and
  // equals `PluginNode.id`, so no slash→dot bridging is needed.
  const byPluginId = useMemo(() => {
    const m = new Map<string, ConfigRegistration[]>();
    for (const reg of registrations) {
      const list = m.get(reg.pluginId);
      if (list) list.push(reg);
      else m.set(reg.pluginId, [reg]);
    }
    return m;
  }, [registrations]);

  const rows = useMemo<ConfigNavRow[]>(() => {
    if (!payload) return [];
    const matched = new Set<string>();
    const pruned = pruneConfigTree(payload.plugins, byPluginId, matched);

    // Defensive: a config registration should always map to a plugin-tree node
    // (both derive from the same plugin set). If one doesn't, surface it loudly
    // and still render it so the settings page is never silently lost.
    const orphans = registrations.filter((r) => !matched.has(r.pluginId));
    if (orphans.length > 0) {
      console.warn(
        "[config] registrations missing from plugin tree:",
        orphans.map((r) => r.pluginId),
      );
      const byOrphanId = new Map<string, ConfigRegistration[]>();
      for (const reg of orphans) {
        const list = byOrphanId.get(reg.pluginId);
        if (list) list.push(reg);
        else byOrphanId.set(reg.pluginId, [reg]);
      }
      for (const orphanRegs of byOrphanId.values()) {
        const [reg] = orphanRegs;
        if (!reg) continue;
        const node: PluginNode = {
          path: reg.pluginId,
          name: reg.pluginName,
          id: reg.pluginId,
          loadBearing: false,
          disabledSeed: false,
          collapsed: false,
          runtimes: { web: true, server: false, central: false },
          children: [],
          facets: {},
        };
        pruned.push({ node, registrations: orphanRegs, children: [] });
      }
    }
    return flattenConfigTree(pruned);
  }, [payload, byPluginId, registrations]);

  const modifiedCountOf = useCallback(
    (row: ConfigNavRow) => {
      if (modifiedRes.pending || !row.registration) return 0;
      return modifiedRes.data[row.registration.storePath] ?? 0;
    },
    [modifiedRes],
  );
  const hasConflictOf = useCallback(
    (row: ConfigNavRow) => {
      if (conflictRes.pending || !row.registration) return false;
      return conflictRes.data.includes(row.registration.storePath);
    },
    [conflictRes],
  );

  const selectedPath = configDetailPane.useRouteEntry()?.params.configPath;
  const selectedRowId = useMemo(() => {
    if (!selectedPath) return undefined;
    return rows.find(
      (r) =>
        r.registration &&
        encodeURIComponent(r.registration.storePath) === selectedPath,
    )?.id;
  }, [rows, selectedPath]);

  const handleActivate = useCallback(
    (row: ConfigNavRow) => {
      // Group / multi-config header rows have no config of their own — the
      // chevron toggles them; a body click is a no-op.
      if (!row.registration) return;
      openPane(
        configDetailPane,
        { configPath: encodeURIComponent(row.registration.storePath) },
        { mode: "push" },
      );
    },
    [openPane],
  );

  const hierarchy = useMemo<HierarchyConfig<ConfigNavRow>>(
    () => ({
      getParentId: (r) => r.parentId,
      getRank: (r) => r.rank,
      isExpanded: (r) => !collapsed.has(r.id),
      onToggleExpanded: (id, next) =>
        setCollapsed((prev) => {
          const set = new Set(prev);
          if (next) set.delete(id);
          else set.add(id);
          return set;
        }),
    }),
    [collapsed],
  );

  // Typed fields drive the data-view filter builder. `label` is the primary
  // (only-rendered-in-tree) field; the rest are filter-only — invisible in the
  // tree body but usable in the "Filter" pill (Modified / Conflict / Source).
  // `filterable: false` keeps them out of the full-text search accessor.
  const fields = useMemo<FieldDef<ConfigNavRow>[]>(
    () => [
      { id: "label", label: "Name", primary: true, value: (r) => r.label },
      {
        id: "modified",
        label: "Modified",
        type: "bool",
        filterable: false,
        value: (r) => modifiedCountOf(r) > 0,
      },
      {
        id: "conflict",
        label: "Conflict",
        type: "bool",
        filterable: false,
        value: (r) => hasConflictOf(r),
      },
      {
        id: "source",
        label: "Source",
        type: "enum",
        filterable: false,
        options: [
          { value: "manual", label: "Authored" },
          { value: "reorder", label: "Reorder" },
          { value: "view", label: "View" },
        ],
        value: (r) => r.registration?.descriptor.source ?? undefined,
      },
    ],
    [modifiedCountOf, hasConflictOf],
  );

  const treeOptions = useMemo<TreeViewOptions<ConfigNavRow>>(
    () => ({
      expandAll: true,
      trailing: (r) => (
        <ConfigRowBadge
          modifiedCount={modifiedCountOf(r)}
          hasConflict={hasConflictOf(r)}
          source={r.registration?.descriptor.source}
        />
      ),
    }),
    [modifiedCountOf, hasConflictOf],
  );

  return (
    <DataView<ConfigNavRow>
      rows={rows}
      fields={fields}
      rowKey={(r) => r.id}
      views={["tree"]}
      storageKey={CONFIG_NAV_VIEW}
      loading={isPending}
      hierarchy={hierarchy}
      selectedRowId={selectedRowId}
      onRowActivate={handleActivate}
      searchAccessor={(r) => r.searchText}
      viewOptions={{ tree: treeOptions }}
    />
  );
}
