import { useMemo, useState } from "react";
import { FilterChip } from "@plugins/primitives/plugins/filter-chips/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { DataTable } from "@plugins/primitives/plugins/data-table/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getPluginFacetsTree } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import type {
  PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/core";
import { Contributions } from "../slots";
import type { FacetTableEntry } from "../facet-table";

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

export function ContributionsView() {
  const { data: treeData, isLoading, error } = useEndpoint(getPluginFacetsTree, {});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const openPane = useOpenPane();
  // Each facet contributes one declarative table; the host stays facet-blind,
  // slicing `node.facets[facetId]` and projecting to rows generically.
  const tables = Contributions.FacetTable.useContributions();
  const sortedTables = useMemo(
    () => [...tables].sort((a, b) => a.label.localeCompare(b.label)),
    [tables],
  );

  const plugins = treeData?.plugins ?? null;

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

  if (isLoading) {
    return (
      <Center axis="both" className="h-full">
        <Loading />
      </Center>
    );
  }
  if (error) {
    return (
      <Center axis="both" className="h-full p-2xl">
        <Stack gap="sm" align="center" className="text-center">
          <Text variant="body" className="font-medium text-foreground">
            Failed to load
          </Text>
          <Text variant="body" tone="muted">
            {String(error)}
          </Text>
        </Stack>
      </Center>
    );
  }

  const activeId = selectedId ?? sortedTables[0]?.facetId ?? null;
  const activeTable = sortedTables.find((t) => t.facetId === activeId) ?? null;
  const activeRowClick = activeTable?.onRowClick;

  return (
    <Column
      fill
      scrollBody={false}
      className="h-full"
      header={
        <>
          <Scroll axis="x" className="border-b px-md py-sm">
            <Stack direction="row" gap="xs">
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
                      colorClass={active ? "bg-foreground/10 text-foreground" : undefined}
                    >
                      {count}
                    </Badge>
                  </FilterChip>
                );
              })}
            </Stack>
          </Scroll>

          <div className="border-b px-md py-sm">
            <SearchInput
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
            />
          </div>
        </>
      }
      body={
        activeTable ? (
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
          <Center axis="both" className="h-full">
            <Text variant="body" tone="muted">
              No contribution tables registered
            </Text>
          </Center>
        )
      }
    />
  );
}
