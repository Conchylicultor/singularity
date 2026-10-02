import type { FieldDef } from "@plugins/fields/core";

/**
 * One field type's fixed exhibit: a field built with that type's own factory
 * (fixed label and description) and a fixed value it renders meaningfully —
 * a non-empty list, a couple of tags, a set colour.
 *
 * Fixed rather than sampled from registered configs, so whatever shows every
 * field type (the `config/field-gallery` specimen) renders the same rows on
 * every machine and on every build, and a hand-written mock can mirror it.
 */
export interface FieldSample<T = unknown> {
  readonly field: FieldDef<T>;
  readonly value: T;
}

/**
 * Build a {@link FieldSample}. `value` is checked against the field's own value
 * type (`NoInfer` keeps it from widening `T`), so a sample cannot hold a value
 * its field would not.
 */
export function fieldSample<T>(
  field: FieldDef<T>,
  value: NoInfer<T>,
): FieldSample<T> {
  return Object.freeze({ field, value });
}
