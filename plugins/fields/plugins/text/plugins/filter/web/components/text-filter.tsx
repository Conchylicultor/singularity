import type { ReactNode } from "react";
import type { FilterValueInputProps } from "@plugins/primitives/plugins/data-view/web";

/** Single text operand input for the text operators (contains / is / …). */
export function TextValueInput(props: FilterValueInputProps): ReactNode {
  const value = typeof props.value === "string" ? props.value : "";
  return (
    <input
      type="text"
      className="w-40 rounded-md border border-input bg-background px-xs py-2xs text-body"
      placeholder="Value…"
      value={value}
      onChange={(e) => props.onChange(e.target.value || undefined)}
    />
  );
}
