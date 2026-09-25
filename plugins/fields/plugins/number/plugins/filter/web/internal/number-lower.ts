import {
  and,
  clause,
  type Filter,
} from "@plugins/network/plugins/live/plugins/filter/core";
import type { FilterLowerContext } from "@plugins/primitives/plugins/data-view/core";

type Lower = (operand: unknown, ctx: FilterLowerContext) => Filter | undefined;

/** The `between` operand: an inclusive `[min, max]`, either bound open. */
export interface NumberRange {
  min?: number;
  max?: number;
}

/** The operand as a finite number, or null when absent/non-numeric. */
function asNumber(operand: unknown): number | null {
  return typeof operand === "number" && Number.isFinite(operand)
    ? operand
    : null;
}

function binary(op: "eq" | "ne" | "gt" | "lt" | "gte" | "lte"): Lower {
  return (operand, { column }) => {
    const b = asNumber(operand);
    return b === null ? undefined : clause(column, op, b);
  };
}

/**
 * The number operators lowered into the filter language's `number` domain.
 * `≠` is the complement of `=`, so it keeps a row with no value.
 */
export const numberLower = {
  "=": binary("eq"),
  "≠": binary("ne"),
  ">": binary("gt"),
  "<": binary("lt"),
  "≥": binary("gte"),
  "≤": binary("lte"),
  between: (operand, { column }) => {
    const range = (operand ?? {}) as NumberRange;
    const min = asNumber(range.min);
    const max = asNumber(range.max);
    const bounds: Filter[] = [];
    if (min !== null) bounds.push(clause(column, "gte", min));
    if (max !== null) bounds.push(clause(column, "lte", max));
    if (bounds.length === 0) return undefined;
    return bounds.length === 1 ? bounds[0] : and(...bounds);
  },
  "is-empty": (_operand, { column }) => clause(column, "isEmpty"),
  "is-not-empty": (_operand, { column }) => clause(column, "isNotEmpty"),
} satisfies Record<string, Lower>;
