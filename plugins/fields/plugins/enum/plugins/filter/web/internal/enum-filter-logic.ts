import type { FilterFieldValue } from "@plugins/primitives/plugins/data-view/web";

/** The row's enum value as a string, or "" when empty. */
function fieldString(fieldValue: FilterFieldValue): string {
  if (fieldValue === null || fieldValue === undefined) return "";
  if (Array.isArray(fieldValue)) return fieldValue[0] ?? "";
  return String(fieldValue);
}

function asString(operand: unknown): string {
  return typeof operand === "string" ? operand : "";
}

function asList(operand: unknown): string[] {
  return Array.isArray(operand)
    ? operand.filter((x): x is string => typeof x === "string")
    : [];
}

function isEmptyValue(fieldValue: FilterFieldValue): boolean {
  return fieldString(fieldValue) === "";
}

export function is(operand: unknown, fieldValue: FilterFieldValue): boolean {
  const want = asString(operand);
  if (want === "") return true;
  return fieldString(fieldValue) === want;
}

export function isNot(operand: unknown, fieldValue: FilterFieldValue): boolean {
  const want = asString(operand);
  if (want === "") return true;
  return fieldString(fieldValue) !== want;
}

export function isAnyOf(
  operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  const list = asList(operand);
  if (list.length === 0) return true;
  return list.includes(fieldString(fieldValue));
}

export function isNoneOf(
  operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  const list = asList(operand);
  if (list.length === 0) return true;
  return !list.includes(fieldString(fieldValue));
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
