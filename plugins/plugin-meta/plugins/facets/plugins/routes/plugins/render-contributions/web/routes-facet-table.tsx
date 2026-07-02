import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  defineFacetTable,
  type FacetTableEntry,
  PluginChip,
} from "@plugins/plugin-meta/plugins/contributions-table/web";
import type { ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type {
  RoutesData,
  RouteDef,
} from "@plugins/plugin-meta/plugins/facets/plugins/routes/core";
import { MdAltRoute } from "react-icons/md";

type RouteRow = {
  plugin: PluginNode;
  method: string;
  path: string;
  runtime: string;
  callers: number;
};

// The facet stores the method inside the route string for HTTP routes
// ("GET /api/foo") and carries type === "ws" for WS routes (no method prefix).
const METHOD_COLORS: Record<string, string> = {
  GET: "text-categorical-2",
  POST: "text-categorical-1",
  PUT: "text-categorical-3",
  PATCH: "text-categorical-3",
  DELETE: "text-categorical-4",
  WS: "text-categorical-5",
};

function methodAndPath(r: RouteDef): { method: string; path: string } {
  if (r.type === "ws") return { method: "WS", path: r.route };
  const spaceIdx = r.route.indexOf(" ");
  if (spaceIdx < 0) return { method: "", path: r.route };
  return {
    method: r.route.slice(0, spaceIdx),
    path: r.route.slice(spaceIdx + 1),
  };
}

const columns: ColumnDef<RouteRow>[] = [
  {
    id: "method",
    header: "Method",
    width: "3rem",
    value: (row) => row.method,
    cell: (row) => (
      <span
        className={cn(
          "font-mono text-3xs font-semibold",
          METHOD_COLORS[row.method] ?? "text-muted-foreground",
        )}
      >
        {row.method}
      </span>
    ),
  },
  {
    id: "path",
    header: "Path",
    width: "minmax(0,1fr)",
    value: (row) => row.path,
    cell: (row) => (
      <code className="truncate font-mono text-foreground">{row.path}</code>
    ),
  },
  {
    id: "runtime",
    header: "Runtime",
    value: (row) => row.runtime,
    cell: (row) => (
      <span className="font-mono text-muted-foreground">{row.runtime}</span>
    ),
  },
  {
    id: "plugin",
    header: "Plugin",
    value: (row) => row.plugin.id,
    cell: (row) => <PluginChip pluginId={row.plugin.id} />,
  },
  {
    id: "callers",
    cell: (row) =>
      row.callers > 0 ? (
        <span className="text-3xs text-muted-foreground/60">
          {row.callers} caller{row.callers !== 1 ? "s" : ""}
        </span>
      ) : null,
  },
];

function rows(entries: FacetTableEntry[]): RouteRow[] {
  const result: RouteRow[] = [];
  for (const entry of entries) {
    const data = entry.data as RoutesData;
    const callers = data.endpointCallers.length;
    for (const r of data.routes) {
      const { method, path } = methodAndPath(r);
      result.push({ plugin: entry.node, method, path, runtime: r.runtime, callers });
    }
  }
  return result;
}

export const routesFacetTable = defineFacetTable<RouteRow>({
  facetId: "routes",
  label: "Routes",
  icon: MdAltRoute,
  columns,
  rows,
  rowKey: (r) => `${r.plugin.id}:${r.runtime}:${r.method} ${r.path}`,
});
