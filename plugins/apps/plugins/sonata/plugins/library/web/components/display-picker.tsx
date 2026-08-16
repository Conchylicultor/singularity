import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ComponentType } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { AdaptiveBar } from "@plugins/primitives/plugins/adaptive-bar/web";
import { useActionForm } from "@plugins/primitives/plugins/action-presentation/web";

type PickerItem = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
};

/**
 * One choice: a bordered toggle button, in the row or in the `⋯` panel.
 *
 * It declares NO smaller form, and that is the deliberate answer rather than an
 * omission. `compact` would be icon-only, and an item's icon is optional — half
 * the pickers would collapse to an empty box; `row` would mean hand-writing the
 * second appearance again, which is exactly the drift this replaces. With one
 * rung the button relocates as ITSELF, keeping its label, its loaded dot and its
 * pressed styling — so the panel needs no ✓ affordance to say which one is on.
 *
 * The active choice yields last, which is where `priorityIds` used to live: the
 * picker no longer tells the bar who matters, the chosen option says so itself.
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
  // Return discarded on purpose: with no `shrinksTo` the hook can only ever
  // answer `"full"`, so this call is the declaration half and nothing else.
  useActionForm({ yields: active ? "never" : "normal" });
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
 * Keeps as many choices inline as fit and relocates the rest behind a ⋯ panel
 * (never wrapping). Generic over the contribution shape — never names a specific
 * contributor (collection-consumer clean), and never names a privileged one
 * either: which choice leaves the row last is the choice's own declaration.
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
    <AdaptiveBar gap="xs" label="More displays">
      {items.map((item) => (
        <AdaptiveBar.Item key={item.id} id={item.id}>
          <PickerOption
            item={item}
            active={item.id === activeId}
            loaded={loadedIds?.includes(item.id) ?? false}
            onSelect={() => onSelect(item.id)}
          />
        </AdaptiveBar.Item>
      ))}
    </AdaptiveBar>
  );
}
