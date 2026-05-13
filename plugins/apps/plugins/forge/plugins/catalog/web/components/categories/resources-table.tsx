import { useMemo } from "react";
import type { PluginNode, ResourceInfo } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { flattenTree } from "../catalog-view";
import { PluginChip } from "../plugin-chip";

export function ResourcesTable({
  plugins,
  filter,
}: {
  plugins: PluginNode[];
  filter: string;
}) {
  const rows = useMemo(() => {
    const all = flattenTree<ResourceInfo>(plugins, (p) => p.publicApi?.resources ?? []);
    const lc = filter.toLowerCase();
    return lc
      ? all.filter(
          ({ item, plugin }) =>
            item.key.toLowerCase().includes(lc) ||
            item.mode.toLowerCase().includes(lc) ||
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
      {rows.map(({ item, plugin }) => (
        <div
          key={`${plugin.hierarchyId}:${item.key}`}
          className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 text-xs hover:bg-accent/30"
        >
          <code className="min-w-0 flex-1 truncate font-mono text-foreground">
            {item.key}
          </code>
          <span className="w-12 shrink-0 text-center font-mono text-[10px] text-muted-foreground/60">
            {item.mode}
          </span>
          <PluginChip hierarchyId={plugin.hierarchyId} />
        </div>
      ))}
    </div>
  );
}

function Header() {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      <span className="flex-1">Key</span>
      <span className="w-12 shrink-0 text-center">Mode</span>
      <span>Plugin</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
      No resources found
    </div>
  );
}
