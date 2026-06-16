import type { ReactNode } from "react";
import type { FilterValueInputProps } from "@plugins/primitives/plugins/data-view/web";
import type { DateRange } from "../internal/date-filter-logic";

/** Single native date picker for the day-comparison operators (is / before / …). */
export function DateValueInput(props: FilterValueInputProps): ReactNode {
  const value = typeof props.value === "string" ? props.value : "";
  return (
    <input
      type="date"
      className="rounded-md border border-input bg-background px-xs py-2xs text-body"
      value={value}
      onChange={(e) => props.onChange(e.target.value || undefined)}
    />
  );
}

/** Two native date pickers forming an inclusive [from, to] range for `is-between`. */
export function DateRangeInput(props: FilterValueInputProps): ReactNode {
  const range = (props.value ?? {}) as DateRange;

  function update(patch: Partial<DateRange>) {
    props.onChange({ ...range, ...patch });
  }

  return (
    <div className="flex items-center gap-xs">
      <input
        type="date"
        className="rounded-md border border-input bg-background px-xs py-2xs text-body"
        value={range.from ?? ""}
        onChange={(e) => update({ from: e.target.value || undefined })}
      />
      <span className="text-muted-foreground">–</span>
      <input
        type="date"
        className="rounded-md border border-input bg-background px-xs py-2xs text-body"
        value={range.to ?? ""}
        onChange={(e) => update({ to: e.target.value || undefined })}
      />
    </div>
  );
}
