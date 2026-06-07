import { useEffect, useMemo, useState } from "react";
import { FilterChip } from "@plugins/primitives/plugins/filter-chips/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { DataTable } from "@plugins/primitives/plugins/data-table/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import type {
  PluginNode,
  PluginTreePayload,
} from "@plugins/plugin-meta/plugins/plugin-view/core";
import { Catalog } from "../slots";
import type { FacetTableEntry } from "../facet-table";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; data: PluginTreePayload }
  | { kind: "error"; message: string };

/** Flatten the plugin tree into one entry per plugin carrying its slice of a facet. */
function facetEntries(plugins: PluginNode[], facetId: string): FacetTableEntry[] {
  const out: FacetTableEntry[] = [];
  function visit(node: PluginNode) {
    const data = node.facets[facetId];
    if (data !== undefined) out.push({ node, data });
    for (const child of node.children) visit(child);
  }
  for (const p of plugins) visit(p);
  return out;
}

export function CatalogView() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const openPane = useOpenPane();
  // Each facet contributes one declarative table; the host stays facet-blind,
  // slicing `node.facets[facetId]` and projecting to rows generically.
  const tables = Catalog.FacetTable.useContributions();
  const sortedTables = useMemo(
    () => [...tables].sort((a, b) => a.label.localeCompare(b.label)),
    [tables],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/plugin-view/tree")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setState({
            kind: "error",
            message: text || `Failed to load (${res.status})`,
          });
          return;
        }
        const data = (await res.json()) as PluginTreePayload;
        setState({ kind: "ok", data });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const plugins = state.kind === "ok" ? state.data.plugins : null;

  // Project every facet's rows once per tree load so tab badges and the active
  // table share the same computation.
  const rowsByFacet = useMemo(() => {
    const map = new Map<string, unknown[]>();
    if (!plugins) return map;
    for (const table of sortedTables) {
      map.set(table.facetId, table.rows(facetEntries(plugins, table.facetId)));
    }
    return map;
  }, [plugins, sortedTables]);

  if (state.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm">
        <span className="font-medium text-foreground">Failed to load</span>
        <span className="text-muted-foreground">{state.message}</span>
      </div>
    );
  }

  const activeId = selectedId ?? sortedTables[0]?.facetId ?? null;
  const activeTable = sortedTables.find((t) => t.facetId === activeId) ?? null;
  const activeRowClick = activeTable?.onRowClick;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-1 overflow-x-auto border-b px-3 py-2">
        {sortedTables.map((table) => {
          const count = rowsByFacet.get(table.facetId)?.length ?? 0;
          const active = table.facetId === activeId;
          return (
            <FilterChip
              key={table.facetId}
              active={active}
              onClick={() => {
                setSelectedId(table.facetId);
                setFilter("");
              }}
            >
              <table.icon size={14} />
              <span className="font-medium">{table.label}</span>
              <Badge
                size="sm"
                colorClass={active ? "bg-foreground/10 text-foreground" : undefined}
              >
                {count}
              </Badge>
            </FilterChip>
          );
        })}
      </div>

      <div className="border-b px-3 py-2">
        <SearchInput
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTable ? (
          <DataTable
            data={rowsByFacet.get(activeTable.facetId) ?? []}
            columns={activeTable.columns}
            filter={filter}
            rowKey={activeTable.rowKey}
            onRowClick={
              activeRowClick
                ? (row) => activeRowClick(row, { openPane })
                : undefined
            }
            emptyLabel={`No ${activeTable.label.toLowerCase()} found`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No catalog tables registered
          </div>
        )}
      </div>
    </div>
  );
}
