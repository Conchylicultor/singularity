import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { PluginNode, RouteInfo } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { flattenTree } from "../catalog-view";
import { PluginChip } from "../plugin-chip";

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

export function RoutesTable({
  plugins,
  filter,
}: {
  plugins: PluginNode[];
  filter: string;
}) {
  const rows = useMemo(() => {
    const all = flattenTree<RouteInfo>(plugins, (p) => p.publicApi?.routes ?? []);
    const lc = filter.toLowerCase();
    return lc
      ? all.filter(
          ({ item, plugin }) =>
            item.route.toLowerCase().includes(lc) ||
            plugin.hierarchyId.toLowerCase().includes(lc),
        )
      : all;
  }, [plugins, filter]);

  if (rows.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col">
      <Header />
      {rows.map(({ item, plugin }) => {
        const { method, path } = parseRoute(item.route);
        return (
          <div
            key={`${plugin.hierarchyId}:${item.route}`}
            className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 text-xs hover:bg-accent/30"
          >
            <span
              className={cn(
                "w-12 shrink-0 font-mono text-[10px] font-semibold",
                METHOD_COLORS[method] ?? "text-muted-foreground",
              )}
            >
              {method}
            </span>
            <code className="min-w-0 flex-1 truncate font-mono text-foreground">
              {path}
            </code>
            <PluginChip hierarchyId={plugin.hierarchyId} />
            {item.callers.length > 0 && (
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {item.callers.length} caller{item.callers.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Header() {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      <span className="w-12 shrink-0">Method</span>
      <span className="flex-1">Path</span>
      <span>Plugin</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
      No routes found
    </div>
  );
}
