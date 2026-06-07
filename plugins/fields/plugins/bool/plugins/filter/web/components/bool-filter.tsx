import type { ReactNode } from "react";
import { SegmentedControl } from "@plugins/primitives/plugins/toggle-chip/web";
import type { FilterControlProps } from "@plugins/primitives/plugins/data-view/web";
import type { BoolFilterValue } from "../internal/bool-filter-logic";

const OPTIONS = [
  { id: "any", label: "Any" },
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
] as const;

export function BoolFilter(props: FilterControlProps): ReactNode {
  const value = (props.value ?? {}) as BoolFilterValue;
  const current = value.want === true ? "yes" : value.want === false ? "no" : "any";
  return (
    <SegmentedControl
      options={OPTIONS}
      value={current}
      onChange={(id) =>
        props.onChange(id === "any" ? {} : { want: id === "yes" })
      }
      variant="ghost"
      size="sm"
    />
  );
}
