import { useCallback, useState, useMemo } from "react";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { SearchInput, useTextFilter } from "@plugins/primitives/plugins/search/web";
import { FilterChip } from "@plugins/primitives/plugins/filter-chips/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getPluginTree } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import type { ConfigRegistration } from "@plugins/config_v2/web";
import { configDetailPane } from "../internal/panes";
import { pruneConfigTree } from "../internal/prune-config-tree";
import type { ConfigTreeNode as ConfigTreeNodeData } from "../internal/prune-config-tree";
import { ConfigTreeNode } from "./config-tree-node";
import { ConfigNavRow } from "./config-nav-row";

const hierarchyIdOf = (reg: ConfigRegistration) =>
  reg.hierarchyPath.split("/").join(".");

export function ConfigNav() {
  const registrations = useConfigRegistrations();
  const openPane = useOpenPane();
  const [showModifiedOnly, setShowModifiedOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data: payload, isPending } = useEndpoint(getPluginTree, {});

  const accessor = useCallback(
    (r: ConfigRegistration) =>
      `${r.pluginName} ${Object.values(r.descriptor.fields)
        .map((f) => f.meta.label ?? "")
        .join(" ")}`,
    [],
  );

  const { query, setQuery, filtered } = useTextFilter({
    items: registrations,
    accessor,
  });

  const byHierarchyId = useMemo(() => {
    const m = new Map<string, ConfigRegistration[]>();
    for (const reg of registrations) {
      const id = hierarchyIdOf(reg);
      const list = m.get(id);
      if (list) list.push(reg);
      else m.set(id, [reg]);
    }
    return m;
  }, [registrations]);

  const tree = useMemo<ConfigTreeNodeData[]>(() => {
    if (!payload) return [];
    const matched = new Set<string>();
    const pruned = pruneConfigTree(payload.plugins, byHierarchyId, matched);

    // Defensive: a config registration should always map to a plugin-tree node
    // (both derive from the same plugin set). If one doesn't, surface it loudly
    // and still render it so the settings page is never silently lost.
    const orphans = registrations.filter((r) => !matched.has(hierarchyIdOf(r)));
    if (orphans.length > 0) {
      console.warn(
        "[config] registrations missing from plugin tree:",
        orphans.map((r) => r.hierarchyPath),
      );
      const byOrphanId = new Map<string, ConfigRegistration[]>();
      for (const reg of orphans) {
        const id = hierarchyIdOf(reg);
        const list = byOrphanId.get(id);
        if (list) list.push(reg);
        else byOrphanId.set(id, [reg]);
      }
      for (const orphanRegs of byOrphanId.values()) {
        const [reg] = orphanRegs;
        if (!reg) continue;
        const node: PluginNode = {
          path: reg.hierarchyPath,
          name: reg.pluginName,
          hierarchyId: hierarchyIdOf(reg),
          loadBearing: false,
          collapsed: false,
          runtimes: { web: true, server: false, central: false },
          children: [],
        };
        pruned.push({ node, registrations: orphanRegs, children: [] });
      }
    }
    return pruned;
  }, [payload, byHierarchyId, registrations]);

  const handleToggle = useCallback((id: string, open: boolean) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedPath = configDetailPane.useChainEntry()?.params.configPath;

  const handleSelect = useCallback(
    (reg: ConfigRegistration) => {
      openPane(
        configDetailPane,
        { configPath: encodeURIComponent(reg.storePath) },
        { mode: "push" },
      );
    },
    [openPane],
  );

  const useFlat = query.length > 0 || showModifiedOnly;

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex items-center gap-1">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter configs..."
          className="flex-1"
        />
        <FilterChip active={showModifiedOnly} onClick={() => setShowModifiedOnly((v) => !v)}>
          Modified
        </FilterChip>
      </div>
      <div className="flex-1 overflow-y-auto">
        {useFlat ? (
          filtered.map((reg) => (
            <ConfigNavRow
              key={reg.storePath}
              registration={reg}
              selected={selectedPath === encodeURIComponent(reg.storePath)}
              onClick={() => handleSelect(reg)}
              hideIfUnmodified={showModifiedOnly}
            />
          ))
        ) : isPending ? (
          <Placeholder>Loading…</Placeholder>
        ) : (
          tree.map((item) => (
            <ConfigTreeNode
              key={item.node.hierarchyId}
              item={item}
              depth={0}
              collapsed={collapsed}
              onToggle={handleToggle}
              selectedPath={selectedPath}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
