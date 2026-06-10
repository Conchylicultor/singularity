import type { ReactNode } from "react";
import type { FilterControlProps } from "@plugins/primitives/plugins/data-view/web";
import type { DateFilterValue } from "../internal/date-filter-logic";

/** Two native date inputs forming an inclusive range. */
export function DateFilter(props: FilterControlProps): ReactNode {
  const value = (props.value ?? {}) as DateFilterValue;

  function update(patch: Partial<DateFilterValue>) {
    props.onChange({ ...value, ...patch });
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="date"
        className="rounded-md border border-input bg-background px-1.5 py-0.5 text-body"
        value={value.from ?? ""}
        onChange={(e) => update({ from: e.target.value || undefined })}
      />
      <span className="text-muted-foreground">–</span>
      <input
        type="date"
        className="rounded-md border border-input bg-background px-1.5 py-0.5 text-body"
        value={value.to ?? ""}
        onChange={(e) => update({ to: e.target.value || undefined })}
      />
    </div>
  );
}
