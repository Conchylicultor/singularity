import {
  clause,
  type Filter,
} from "@plugins/network/plugins/live/plugins/filter/core";
import type { FilterLowerContext } from "@plugins/primitives/plugins/data-view/core";

type Lower = (operand: unknown, ctx: FilterLowerContext) => Filter | undefined;

/** The operand as a string, or "" when absent/not a string. */
function asText(operand: unknown): string {
  return typeof operand === "string" ? operand : "";
}

/** A pattern op over a non-empty operand; an empty one is an incomplete rule. */
function pattern(op: "contains" | "notContains" | "eqCi" | "neCi"): Lower {
  return (operand, { column }) => {
    const q = asText(operand);
    return q === "" ? undefined : clause(column, op, q);
  };
}

/**
 * The text operators lowered into the filter language's `text` domain. `is` /
 * `is-not` compare case-insensitively (`eqCi` / `neCi`, ASCII folding — the
 * cluster's), and a negative keeps a row with no value (it is the complement).
 */
export const textLower = {
  contains: pattern("contains"),
  "does-not-contain": pattern("notContains"),
  is: pattern("eqCi"),
  "is-not": pattern("neCi"),
  "is-empty": (_operand, { column }) => clause(column, "isEmpty"),
  "is-not-empty": (_operand, { column }) => clause(column, "isNotEmpty"),
} satisfies Record<string, Lower>;
