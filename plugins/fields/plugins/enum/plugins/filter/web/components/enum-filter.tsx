import type { ReactNode } from "react";
import { ToggleChip } from "@plugins/primitives/plugins/toggle-chip/web";
import type { FilterControlProps } from "@plugins/primitives/plugins/data-view/web";
import type { EnumFilterValue } from "../internal/enum-filter-logic";

/** Multi-select chips; toggling adds/removes an option from `selected`. */
export function EnumFilter(props: FilterControlProps): ReactNode {
  const value = (props.value ?? {}) as EnumFilterValue;
  const selected = value.selected ?? [];
  const options = props.field.options ?? [];

  function toggle(v: string) {
    const next = selected.includes(v)
      ? selected.filter((x) => x !== v)
      : [...selected, v];
    props.onChange({ selected: next });
  }

  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <ToggleChip
          key={o.value}
          active={selected.includes(o.value)}
          variant="ghost"
          size="sm"
          onClick={() => toggle(o.value)}
        >
          {o.label}
        </ToggleChip>
      ))}
    </div>
  );
}
