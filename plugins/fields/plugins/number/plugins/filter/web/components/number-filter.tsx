import type { ReactNode } from "react";
import {
  FilterValueInput,
  type FilterValueInputProps,
} from "@plugins/primitives/plugins/data-view/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
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
    <FilterValueInput
      type="number"
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
    <Stack direction="row" gap="xs" align="center" className="min-w-0">
      <FilterValueInput
        type="number"
        className="min-w-0 flex-1"
        placeholder="Min"
        value={range.min ?? ""}
        onChange={(e) => update({ min: parse(e.target.value) })}
      />
      <Text as="span" variant="body" tone="muted">
        –
      </Text>
      <FilterValueInput
        type="number"
        className="min-w-0 flex-1"
        placeholder="Max"
        value={range.max ?? ""}
        onChange={(e) => update({ max: parse(e.target.value) })}
      />
    </Stack>
  );
}
