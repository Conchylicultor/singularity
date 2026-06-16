import type { FilterFieldValue } from "@plugins/primitives/plugins/data-view/web";

/** The operand as a finite number, or null when absent/non-numeric. */
function asNumber(operand: unknown): number | null {
  if (typeof operand === "number" && Number.isFinite(operand)) return operand;
  return null;
}

/** The row's projected value as a finite number, or null. */
function fieldNumber(fieldValue: FilterFieldValue): number | null {
  if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) {
    return fieldValue;
  }
  return null;
}

/** Empty = null/undefined (no numeric value present). */
function isEmptyValue(fieldValue: FilterFieldValue): boolean {
  return fieldNumber(fieldValue) === null;
}

/** A binary operator factory: empty operand → keep (incomplete rule). */
function binary(
  cmp: (a: number, b: number) => boolean,
): (operand: unknown, fieldValue: FilterFieldValue) => boolean {
  return (operand, fieldValue) => {
    const b = asNumber(operand);
    if (b === null) return true;
    const a = fieldNumber(fieldValue);
    if (a === null) return false;
    return cmp(a, b);
  };
}

export const eq = binary((a, b) => a === b);
export const neq = binary((a, b) => a !== b);
export const gt = binary((a, b) => a > b);
export const lt = binary((a, b) => a < b);
export const gte = binary((a, b) => a >= b);
export const lte = binary((a, b) => a <= b);

export interface NumberRange {
  min?: number;
  max?: number;
}

/** Keep rows whose value falls within [min, max]; missing bounds are open. */
export function between(
  operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  const range = (operand ?? {}) as NumberRange;
  const min = asNumber(range.min);
  const max = asNumber(range.max);
  if (min === null && max === null) return true;
  const a = fieldNumber(fieldValue);
  if (a === null) return false;
  if (min !== null && a < min) return false;
  if (max !== null && a > max) return false;
  return true;
}

export function isEmpty(
  _operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  return isEmptyValue(fieldValue);
}

export function isNotEmpty(
  _operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  return !isEmptyValue(fieldValue);
}
