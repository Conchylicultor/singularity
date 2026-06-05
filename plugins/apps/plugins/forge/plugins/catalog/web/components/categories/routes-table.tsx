import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { PluginNode, RouteInfo } from "@plugins/plugin-meta/plugins/plugin-view/core";
import {
  DataTable,
  type ColumnDef,
} from "@plugins/primitives/plugins/data-table/web";
import { flattenTree } from "../catalog-view";
import { PluginChip } from "../plugin-chip";

type RouteRow = { item: RouteInfo; plugin: PluginNode };

const METHOD_COLORS: Record<string, string> = {
  GET: "text-categorical-2",
  POST: "text-categorical-1",
  PUT: "text-categorical-3",
  PATCH: "text-categorical-3",
  DELETE: "text-categorical-4",
  WS: "text-categorical-5",
};

function parseRoute(route: string) {
  const spaceIdx = route.indexOf(" ");
  if (spaceIdx < 0) return { method: "", path: route };
  return { method: route.slice(0, spaceIdx), path: route.slice(spaceIdx + 1) };
}

const columns: ColumnDef<RouteRow>[] = [
  {
    id: "method",
    header: "Method",
    width: "3rem",
    value: (row) => parseRoute(row.item.route).method,
    cell: (row) => {
      const { method } = parseRoute(row.item.route);
      return (
        <span
          className={cn(
            "font-mono text-[10px] font-semibold",
            METHOD_COLORS[method] ?? "text-muted-foreground",
          )}
        >
          {method}
        </span>
      );
    },
  },
  {
    id: "path",
    header: "Path",
    width: "minmax(0,1fr)",
    value: (row) => parseRoute(row.item.route).path,
    cell: (row) => (
      <code className="truncate font-mono text-foreground">
        {parseRoute(row.item.route).path}
      </code>
    ),
  },
  {
    id: "plugin",
    header: "Plugin",
    value: (row) => row.plugin.hierarchyId,
    cell: (row) => <PluginChip hierarchyId={row.plugin.hierarchyId} />,
  },
  {
    id: "callers",
    cell: (row) =>
      row.item.callers.length > 0 ? (
        <span className="shrink-0 text-[10px] text-muted-foreground/60">
          {row.item.callers.length} caller
          {row.item.callers.length !== 1 ? "s" : ""}
        </span>
      ) : null,
  },
];

export function RoutesTable({
  plugins,
  filter,
}: {
  plugins: PluginNode[];
  filter: string;
}) {
  const rows = useMemo(
    () => flattenTree<RouteInfo>(plugins, (p) => p.publicApi?.routes ?? []),
    [plugins],
  );

  return (
    <DataTable
      data={rows}
      columns={columns}
      filter={filter}
      rowKey={(row) => `${row.plugin.hierarchyId}:${row.item.route}`}
      emptyLabel="No routes found"
    />
  );
}
