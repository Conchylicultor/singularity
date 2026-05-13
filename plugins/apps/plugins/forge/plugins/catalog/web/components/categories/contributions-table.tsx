import { useMemo } from "react";
import type { PluginNode, ContributionInfo } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { flattenTree } from "../catalog-view";
import { PluginChip } from "../plugin-chip";

export function ContributionsTable({
  plugins,
  filter,
}: {
  plugins: PluginNode[];
  filter: string;
}) {
  const rows = useMemo(() => {
    const all = flattenTree<ContributionInfo>(
      plugins,
      (p) => p.publicApi?.contributions ?? [],
    );
    const lc = filter.toLowerCase();
    return lc
      ? all.filter(
          ({ item, plugin }) =>
            item.slot.toLowerCase().includes(lc) ||
            (item.id ?? "").toLowerCase().includes(lc) ||
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
      {rows.map(({ item, plugin }, i) => (
        <div
          key={`${plugin.hierarchyId}:${item.slot}:${item.id ?? i}`}
          className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 text-xs hover:bg-accent/30"
        >
          <code className="w-48 shrink-0 truncate font-mono font-medium text-foreground">
            {item.slot}
          </code>
          <code className="min-w-0 flex-1 truncate font-mono text-muted-foreground/60">
            {item.id ?? "—"}
          </code>
          <PluginChip hierarchyId={plugin.hierarchyId} />
        </div>
      ))}
    </div>
  );
}

function Header() {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      <span className="w-48 shrink-0">Slot</span>
      <span className="flex-1">ID</span>
      <span>Plugin</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
      No contributions found
    </div>
  );
}
