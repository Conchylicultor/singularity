import type { FilterFieldValue } from "@plugins/primitives/plugins/data-view/web";

/** The operand as a boolean (defaults to false when unset, e.g. "Unchecked"). */
function asBool(operand: unknown): boolean {
  return operand === true;
}

/** Keep rows whose boolean projection equals the requested value. */
export function is(operand: unknown, fieldValue: FilterFieldValue): boolean {
  return Boolean(fieldValue) === asBool(operand);
}

/** Keep rows whose boolean projection differs from the requested value. */
export function isNot(operand: unknown, fieldValue: FilterFieldValue): boolean {
  return Boolean(fieldValue) !== asBool(operand);
}
