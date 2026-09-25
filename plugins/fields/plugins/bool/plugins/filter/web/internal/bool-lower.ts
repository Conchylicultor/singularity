import {
  clause,
  type Filter,
} from "@plugins/network/plugins/live/plugins/filter/core";
import type { FilterLowerContext } from "@plugins/primitives/plugins/data-view/core";

type Lower = (operand: unknown, ctx: FilterLowerContext) => Filter;

/**
 * The bool operators lowered into the filter language's `boolean` domain.
 *
 * Always complete: an absent operand reads as "Unchecked" (`false`), a real
 * constraint. A row with no value reads as unchecked too, with no OR: "is
 * checked" is `eq true`, and "is unchecked" is its complement `ne true`, which
 * keeps NULL by construction.
 */
function wantsChecked(operand: unknown): boolean {
  return operand === true;
}

export const boolLower = {
  is: (operand, { column }) =>
    wantsChecked(operand)
      ? clause(column, "eq", true)
      : clause(column, "ne", true),
  "is-not": (operand, { column }) =>
    wantsChecked(operand)
      ? clause(column, "ne", true)
      : clause(column, "eq", true),
} satisfies Record<string, Lower>;
