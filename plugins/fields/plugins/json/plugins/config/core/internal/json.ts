import { z } from "zod";
import {
  type FieldDef,
  type FieldMeta,
  pickMeta,
} from "@plugins/config_v2/core";
import type { FieldType } from "@plugins/fields/core";
import { jsonFieldType } from "@plugins/fields/plugins/json/core";

export interface JsonFieldDef<T> extends FieldDef<T> {
  readonly type: FieldType<T>;
}

/**
 * Typed dynamic-keyed JSON config field. Holds an arbitrary value validated by
 * the supplied Zod schema — the gap `objectField` (fixed-key) and `listField`
 * cannot fill (e.g. a recursive tree, or a `Record<string, …>` map). The value
 * is app-written, not hand-edited; its settings renderer is read-only.
 */
export function jsonField<T>(
  opts: FieldMeta & { schema: z.ZodType<T>; default: T },
): JsonFieldDef<T> {
  return Object.freeze({
    type: jsonFieldType as FieldType<T>,
    schema: opts.schema,
    defaultValue: opts.default,
    meta: pickMeta(opts),
  });
}
