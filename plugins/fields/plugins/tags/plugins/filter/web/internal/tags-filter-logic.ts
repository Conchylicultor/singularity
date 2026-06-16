import type { FilterFieldValue } from "@plugins/primitives/plugins/data-view/web";

/** The row's tag set as a string[] (empty when not array-valued). */
function fieldTags(fieldValue: FilterFieldValue): readonly string[] {
  return Array.isArray(fieldValue) ? fieldValue : [];
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
  return fieldTags(fieldValue).length === 0;
}

/** Has the given tag. */
export function contains(
  operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  const tag = asString(operand);
  if (tag === "") return true;
  return fieldTags(fieldValue).includes(tag);
}

/** Does not have the given tag. */
export function doesNotContain(
  operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  const tag = asString(operand);
  if (tag === "") return true;
  return !fieldTags(fieldValue).includes(tag);
}

/** Tag set intersects the operand list (match-any). */
export function containsAnyOf(
  operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  const list = asList(operand);
  if (list.length === 0) return true;
  const tags = fieldTags(fieldValue);
  return list.some((t) => tags.includes(t));
}

/** Tag set contains every operand tag (match-all). */
export function containsAllOf(
  operand: unknown,
  fieldValue: FilterFieldValue,
): boolean {
  const list = asList(operand);
  if (list.length === 0) return true;
  const tags = fieldTags(fieldValue);
  return list.every((t) => tags.includes(t));
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
