import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ComponentType } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

type PickerItem = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
};

/**
 * One choice: a bordered toggle button whose pressed styling and loaded dot say
 * which display is on, wherever the row's own `⋯` panel happens to put the
 * picker.
 */
function PickerOption({
  item,
  active,
  loaded,
  onSelect,
}: {
  item: PickerItem;
  active: boolean;
  loaded: boolean;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-sm py-xs text-label transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-transparent text-muted-foreground hover:bg-muted/50",
      )}
    >
      <Stack direction="row" align="center" gap="xs">
        {Icon ? <Icon className="size-3.5" /> : null}
        {item.label}
        {loaded ? (
          <span
            aria-label="loaded"
            className="size-1.5 rounded-full bg-primary"
          />
        ) : null}
      </Stack>
    </button>
  );
}

/**
 * A single-line picker rendered from a list of `{ id, label, icon? }` items.
 * Generic over the contribution shape — it never names a specific contributor
 * (collection-consumer clean).
 *
 * **It owns no bar of its own, and that is the contract rather than a
 * simplification.** This picker is written as one occupant of a row that
 * already has an `AdaptiveBar` — the pane header — and *one adaptive bar per
 * row* (`plugins/primitives/plugins/adaptive-bar/CLAUDE.md`) is what makes the
 * host's width reading mean anything: a bar declares itself `min-w-0 flex-1`
 * and asks the chain above it to grow, so a second one nested inside the first
 * takes the row's whole slack and leaves the outer bar measuring its own
 * content. The header then cannot fit anything — the pane title crushes to its
 * first word while this picker sits at full width.
 *
 * So the options are a plain row, and the `⋯` that collapses them when the
 * header runs out of room is the HEADER's. The whole picker travels there
 * together, label and all, as one live instance — which is what a single-select
 * control wants: split across two surfaces, "which one is on" would be a
 * question the user has to open a panel to answer.
 *
 * No smaller form is declared (no `useActionForm`), and that is deliberate
 * rather than an omission: `compact` would be icon-only and an item's icon is
 * optional, so half the pickers would collapse to empty boxes; `row` would mean
 * hand-writing the second appearance again. With one rung the picker relocates
 * as ITSELF, keeping each option's label, loaded dot and pressed styling — so
 * the panel needs no ✓ affordance to say which display is on.
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

  return (
    <Stack direction="row" align="center" gap="xs">
      {items.map((item) => (
        <PickerOption
          key={item.id}
          item={item}
          active={item.id === activeId}
          loaded={loadedIds?.includes(item.id) ?? false}
          onSelect={() => onSelect(item.id)}
        />
      ))}
    </Stack>
  );
}
