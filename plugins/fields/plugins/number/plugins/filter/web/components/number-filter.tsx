import type { ReactNode } from "react";
import type { FilterValueInputProps } from "@plugins/primitives/plugins/data-view/web";
import type { NumberRange } from "../internal/number-filter-logic";

function parse(raw: string): number | undefined {
  if (raw === "") return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

/** Single numeric operand input for the comparison operators (= ≠ > < ≥ ≤). */
export function NumberValueInput(props: FilterValueInputProps): ReactNode {
  const value = typeof props.value === "number" ? props.value : "";
  return (
    <input
      type="number"
      className="w-24 rounded-md border border-input bg-background px-xs py-2xs text-body"
      placeholder="Value"
      value={value}
      onChange={(e) => props.onChange(parse(e.target.value))}
    />
  );
}

/** Two numeric inputs forming an inclusive [min, max] range for `between`. */
export function NumberRangeInput(props: FilterValueInputProps): ReactNode {
  const range = (props.value ?? {}) as NumberRange;

  function update(patch: Partial<NumberRange>) {
    props.onChange({ ...range, ...patch });
  }

  return (
    <div className="flex items-center gap-xs">
      <input
        type="number"
        className="w-20 rounded-md border border-input bg-background px-xs py-2xs text-body"
        placeholder="Min"
        value={range.min ?? ""}
        onChange={(e) => update({ min: parse(e.target.value) })}
      />
      <span className="text-muted-foreground">–</span>
      <input
        type="number"
        className="w-20 rounded-md border border-input bg-background px-xs py-2xs text-body"
        placeholder="Max"
        value={range.max ?? ""}
        onChange={(e) => update({ max: parse(e.target.value) })}
      />
    </div>
  );
}
