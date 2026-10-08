import { Icon } from "@plugins/ui/plugins/icons/web";
import type { IconRef } from "@plugins/ui/plugins/icons/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";

type PickerItem = {
  id: string;
  label: string;
  icon?: IconRef;
};

/**
 * A single-line, single-select switcher rendered from a list of
 * `{ id, label, icon? }` items: a `SegmentedControl` where every option shows
 * its icon, with its label as the tooltip and the accessible name, and only
 * the ACTIVE option also shows its label as text. An item with no icon always
 * shows its label (an icon-only chip of nothing would be an empty box).
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
 * header runs out of room is the HEADER's. The whole switcher travels there
 * together as one live instance — which is what a single-select control
 * wants: split across two surfaces, "which one is on" would be a question the
 * user has to open a panel to answer.
 *
 * No smaller form is declared (no `useActionForm`): it is already icon-first,
 * and with one rung it relocates as ITSELF, keeping the active option's label
 * and pressed styling — so the panel needs no ✓ affordance to say which
 * display is on.
 */
export function Picker({
  items,
  activeId,
  onSelect,
  empty,
  label,
}: {
  items: PickerItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  empty: string;
  /** The switcher's accessible name. */
  label: string;
}) {
  if (items.length === 0) {
    return (
      <Text variant="caption" tone="muted">
        {empty}
      </Text>
    );
  }

  return (
    <SegmentedControl
      label={label}
      variant="ghost"
      // No option is pressed while nothing is selected: "" matches no item id.
      value={activeId ?? ""}
      onChange={onSelect}
      options={items.map((item) => {
        const showLabel = item.id === activeId || item.icon === undefined;
        return {
          id: item.id,
          title: item.label,
          icon: item.icon ? (
            <Icon icon={item.icon} className="size-3.5" />
          ) : undefined,
          // The inactive options' label stays their accessible name (read from
          // the text content) without taking any room.
          label: showLabel ? (
            item.label
          ) : (
            <span className="sr-only">{item.label}</span>
          ),
        };
      })}
    />
  );
}
