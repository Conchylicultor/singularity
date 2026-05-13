import { useMemo } from "react";
import type { PluginNode, SlotInfo } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { flattenTree } from "../catalog-view";
import { PluginChip } from "../plugin-chip";

export function SlotsTable({
  plugins,
  filter,
}: {
  plugins: PluginNode[];
  filter: string;
}) {
  const rows = useMemo(() => {
    const all = flattenTree<SlotInfo>(plugins, (p) => p.publicApi?.slots ?? []);
    const lc = filter.toLowerCase();
    return lc
      ? all.filter(
          ({ item, plugin }) =>
            `${item.groupName}.${item.memberName}`.toLowerCase().includes(lc) ||
            item.slotId.toLowerCase().includes(lc) ||
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
          key={`${plugin.hierarchyId}:${item.slotId}`}
          className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 text-xs hover:bg-accent/30"
        >
          <code className="w-48 shrink-0 truncate font-mono font-medium text-foreground">
            {item.groupName}.{item.memberName}
          </code>
          <code className="min-w-0 flex-1 truncate font-mono text-muted-foreground/60">
            {item.slotId}
          </code>
          <PluginChip hierarchyId={plugin.hierarchyId} />
          {item.contributors.length > 0 && (
            <span className="shrink-0 text-[10px] text-muted-foreground/60">
              {item.contributors.length} contrib{item.contributors.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Header() {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      <span className="w-48 shrink-0">Group.Member</span>
      <span className="flex-1">Slot ID</span>
      <span>Plugin</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
      No slots found
    </div>
  );
}
