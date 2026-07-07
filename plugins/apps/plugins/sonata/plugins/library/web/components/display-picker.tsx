import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ComponentType, ReactNode } from "react";
import { MdCheck } from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  OverflowMenu,
  type OverflowMenuItem,
} from "@plugins/primitives/plugins/overflow-menu/web";

type PickerItem = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
};

/** Shared icon + label + loaded-dot body used by both the inline chip and the menu row. */
function ItemBody({
  Icon,
  label,
  loaded,
  trailing,
}: {
  Icon?: ComponentType<{ className?: string }>;
  label: string;
  loaded: boolean;
  trailing?: ReactNode;
}) {
  return (
    <Stack direction="row" align="center" gap="xs">
      {Icon ? <Icon className="size-3.5" /> : null}
      {label}
      {loaded ? (
        <span aria-label="loaded" className="size-1.5 rounded-full bg-primary" />
      ) : null}
      {trailing}
    </Stack>
  );
}

/**
 * A single-line picker rendered from a list of `{ id, label, icon? }` items.
 * Keeps as many choices inline as fit and collapses the rest into a ⋯ menu
 * (never wrapping). Generic over the contribution shape — never names a specific
 * contributor (collection-consumer clean).
 */
export function Picker({
  items,
  activeId,
  onSelect,
  empty,
  loadedIds,
}: {
  items: PickerItem[];
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

  const menuItems: OverflowMenuItem[] = items.map((item) => {
    const Icon = item.icon;
    const active = item.id === activeId;
    const loaded = loadedIds?.includes(item.id) ?? false;
    return {
      id: item.id,
      onSelect: () => onSelect(item.id),
      inline: (
        <button
          type="button"
          onClick={() => onSelect(item.id)}
          aria-pressed={active}
          className={cn(
            "rounded-md border px-sm py-xs text-label transition-colors",
            active
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-transparent text-muted-foreground hover:bg-muted/50",
          )}
        >
          <ItemBody Icon={Icon} label={item.label} loaded={loaded} />
        </button>
      ),
      menu: (
        <ItemBody
          Icon={Icon}
          label={item.label}
          loaded={loaded}
          trailing={
            active ? (
              <MdCheck className="ml-auto size-3.5 text-primary" />
            ) : null
          }
        />
      ),
    };
  });

  return (
    <OverflowMenu
      items={menuItems}
      gap={4}
      priorityIds={activeId ? [activeId] : undefined}
    />
  );
}
