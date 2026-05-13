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
  GET: "text-emerald-600 dark:text-emerald-400",
  POST: "text-blue-600 dark:text-blue-400",
  PUT: "text-amber-600 dark:text-amber-400",
  PATCH: "text-amber-600 dark:text-amber-400",
  DELETE: "text-red-600 dark:text-red-400",
  WS: "text-violet-600 dark:text-violet-400",
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
    width: "w-12 shrink-0",
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
    width: "flex-1 min-w-0",
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
