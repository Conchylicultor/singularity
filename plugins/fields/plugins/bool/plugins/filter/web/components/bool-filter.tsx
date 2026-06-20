import type { ReactNode } from "react";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import type { FilterValueInputProps } from "@plugins/primitives/plugins/data-view/web";

const OPTIONS = [
  { id: "unchecked", label: "Unchecked" },
  { id: "checked", label: "Checked" },
] as const;

/** Checked / Unchecked selector. Operand is a boolean (default false). */
export function BoolValueInput(props: FilterValueInputProps): ReactNode {
  const current = props.value === true ? "checked" : "unchecked";
  return (
    <SegmentedControl
      options={OPTIONS}
      value={current}
      onChange={(id) => props.onChange(id === "checked")}
      variant="ghost"
    />
  );
}
