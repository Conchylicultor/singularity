import type { ReactNode } from "react";
import type { FilterControlProps } from "@plugins/primitives/plugins/data-view/web";
import type { NumberFilterValue } from "../internal/number-filter-logic";

/**
 * Minimal min/max range control. Carried for the future filter bar (task 2) —
 * not rendered this task, but must typecheck.
 */
export function NumberFilter(props: FilterControlProps): ReactNode {
  const value = (props.value ?? {}) as NumberFilterValue;

  function update(patch: Partial<NumberFilterValue>) {
    props.onChange({ ...value, ...patch });
  }

  function parse(raw: string): number | undefined {
    if (raw === "") return undefined;
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        className="w-20 rounded border border-input bg-background px-1.5 py-0.5 text-sm"
        placeholder="Min"
        value={value.min ?? ""}
        onChange={(e) => update({ min: parse(e.target.value) })}
      />
      <span className="text-muted-foreground">–</span>
      <input
        type="number"
        className="w-20 rounded border border-input bg-background px-1.5 py-0.5 text-sm"
        placeholder="Max"
        value={value.max ?? ""}
        onChange={(e) => update({ max: parse(e.target.value) })}
      />
    </div>
  );
}
