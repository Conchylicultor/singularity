import type { ReactNode } from "react";
import type { FilterControlProps } from "@plugins/primitives/plugins/data-view/web";
import type { TextFilterValue } from "../internal/text-filter-logic";

/** Single substring input. */
export function TextFilter(props: FilterControlProps): ReactNode {
  const value = (props.value ?? {}) as TextFilterValue;
  return (
    <input
      type="text"
      className="w-40 rounded border border-input bg-background px-1.5 py-0.5 text-sm"
      placeholder="Contains…"
      value={value.contains ?? ""}
      onChange={(e) =>
        props.onChange({ contains: e.target.value || undefined })
      }
    />
  );
}
