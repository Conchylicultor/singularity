import type { FilterFieldValue } from "@plugins/primitives/plugins/data-view/web";

/** The operand as a string, or "" when absent/empty. */
function asText(operand: unknown): string {
  return typeof operand === "string" ? operand : "";
}

/** The row's projected value as a (possibly empty) string. */
function fieldText(fieldValue: FilterFieldValue): string {
  if (fieldValue === null || fieldValue === undefined) return "";
  if (Array.isArray(fieldValue)) return fieldValue.join(" ");
  if (fieldValue instanceof Date) return fieldValue.toISOString();
  return String(fieldValue);
}

/** Empty = null/undefined/"" (whitespace-trimmed). */
function isEmptyValue(fieldValue: FilterFieldValue): boolean {
  return fieldText(fieldValue).trim() === "";
}

export function contains(
  operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  const q = asText(operand);
  if (q === "") return true;
  return fieldText(fieldValue).toLowerCase().includes(q.toLowerCase());
}

export function doesNotContain(
  operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  const q = asText(operand);
  if (q === "") return true;
  return !fieldText(fieldValue).toLowerCase().includes(q.toLowerCase());
}

export function is(operand: unknown, fieldValue: FilterFieldValue): boolean {
  const q = asText(operand);
  if (q === "") return true;
  return fieldText(fieldValue).toLowerCase() === q.toLowerCase();
}

export function isNot(operand: unknown, fieldValue: FilterFieldValue): boolean {
  const q = asText(operand);
  if (q === "") return true;
  return fieldText(fieldValue).toLowerCase() !== q.toLowerCase();
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
