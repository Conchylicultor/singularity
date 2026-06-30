import { z } from "zod";
import { type FieldDef, type FieldMeta, type FieldType, pickMeta } from "@plugins/fields/core";
import { textFieldType } from "@plugins/fields/plugins/text/core";

// A text column branded with a closed string-union — the field-record analogue
// of `text("x").$type<MailLabelType>()`. Reuses the `text` storage token (so the
// DB column is a plain `text`, DDL-identical to a raw branded text column — the
// `$type` brand is TS-only, invisible in the DDL) while PRESERVING the union in
// the value type, which `enumField` deliberately erases to `string`.
//
// Pass a `readonly` tuple of the allowed values (e.g. a `MAIL_LABEL_TYPES`
// const array). `InferFieldValue` then reports the exact union, so a column
// built from this field and a `z.infer` of the same record agree by
// construction. `default` defaults to the first value.
export function enumTextField<const T extends readonly [string, ...string[]]>(
  values: T,
  opts?: FieldMeta & { default?: T[number] },
): FieldDef<T[number]> {
  return Object.freeze({
    type: textFieldType as FieldType<T[number]>,
    schema: z.enum(values) as unknown as z.ZodType<T[number]>,
    defaultValue: opts?.default ?? values[0],
    meta: pickMeta(opts),
  });
}
