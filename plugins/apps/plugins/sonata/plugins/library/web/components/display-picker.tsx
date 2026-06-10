import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { Text } from "@plugins/primitives/plugins/text/web";

/**
 * A horizontal picker rendered from a list of `{ id, label, icon? }` items.
 * Generic over the contribution shape — never names a specific contributor
 * (collection-consumer clean).
 */
export function Picker({
  items,
  activeId,
  onSelect,
  empty,
  loadedIds,
}: {
  items: {
    id: string;
    label: string;
    icon?: ComponentType<{ className?: string }>;
  }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  empty: string;
  /** Ids that carry loaded input — rendered with a filled dot (e.g. sources). */
  loadedIds?: string[];
}) {
  if (items.length === 0) {
    return (
      <Text variant="caption" tone="muted">
        {empty}
      </Text>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeId;
        const loaded = loadedIds?.includes(item.id) ?? false;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-pressed={active}
            // eslint-disable-next-line row/no-adhoc-row -- bespoke picker: per-item "loaded" dot indicator that SegmentedControl can't express
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-label transition-colors",
              active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-transparent text-muted-foreground hover:bg-muted/50",
            )}
          >
            {Icon ? <Icon className="size-3.5" /> : null}
            {item.label}
            {loaded ? (
              <span
                aria-label="loaded"
                className="size-1.5 rounded-full bg-primary"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
