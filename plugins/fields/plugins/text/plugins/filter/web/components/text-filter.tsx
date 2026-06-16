import type { ReactNode } from "react";
import {
  FilterValueInput,
  type FilterValueInputProps,
} from "@plugins/primitives/plugins/data-view/web";

/** Single text operand input for the text operators (contains / is / …). */
export function TextValueInput(props: FilterValueInputProps): ReactNode {
  const value = typeof props.value === "string" ? props.value : "";
  return (
    <FilterValueInput
      type="text"
      placeholder="Value…"
      value={value}
      onChange={(e) => props.onChange(e.target.value || undefined)}
    />
  );
}
