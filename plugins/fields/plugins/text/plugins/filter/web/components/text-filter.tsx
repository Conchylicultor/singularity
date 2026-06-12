import type { ReactNode } from "react";
import type { FilterControlProps } from "@plugins/primitives/plugins/data-view/web";
import type { TextFilterValue } from "../internal/text-filter-logic";

/** Single substring input. */
export function TextFilter(props: FilterControlProps): ReactNode {
  const value = (props.value ?? {}) as TextFilterValue;
  return (
    <input
      type="text"
      className="w-40 rounded-md border border-input bg-background px-xs py-2xs text-body"
      placeholder="Contains…"
      value={value.contains ?? ""}
      onChange={(e) =>
        props.onChange({ contains: e.target.value || undefined })
      }
    />
  );
}
