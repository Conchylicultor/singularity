import {
  clause,
  type Filter,
} from "@plugins/network/plugins/live/plugins/filter/core";
import type { FilterLowerContext } from "@plugins/primitives/plugins/data-view/core";

type Lower = (operand: unknown, ctx: FilterLowerContext) => Filter | undefined;

function asString(operand: unknown): string {
  return typeof operand === "string" ? operand : "";
}

function asList(operand: unknown): string[] {
  return Array.isArray(operand)
    ? operand.filter((x): x is string => typeof x === "string")
    : [];
}

function single(op: "eq" | "ne"): Lower {
  return (operand, { column }) => {
    const want = asString(operand);
    return want === "" ? undefined : clause(column, op, want);
  };
}

function list(op: "in" | "notIn"): Lower {
  return (operand, { column }) => {
    const want = asList(operand);
    return want.length === 0 ? undefined : clause(column, op, want);
  };
}

/**
 * The enum operators lowered into the filter language's `text` domain: exact
 * (case-sensitive) option matches. `is-not` / `is-none-of` are complements, so
 * a row with no option matches them.
 */
export const enumLower = {
  is: single("eq"),
  "is-not": single("ne"),
  "is-any-of": list("in"),
  "is-none-of": list("notIn"),
  "is-empty": (_operand, { column }) => clause(column, "isEmpty"),
  "is-not-empty": (_operand, { column }) => clause(column, "isNotEmpty"),
} satisfies Record<string, Lower>;
