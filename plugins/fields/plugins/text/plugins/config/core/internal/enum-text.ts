import { z } from "zod";
import {
  type FieldDef,
  type FieldMeta,
  type FieldType,
  pickMeta,
} from "@plugins/fields/core";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import { textFieldType } from "@plugins/fields/plugins/text/core";

// A text column whose values are exactly what `schema` produces — the
// field-record analogue of `parsedText(name, schema)`, and the general form of
// which `enumTextField` is the closed-set sugar.
//
// It reuses the `text` storage token, whose contribution is a DECODING arm: it
// is handed this very schema and builds the column from it, so the union in the
// value type is derived from what runs rather than asserted. `type.id` stays
// `"text"`, so every DataView cell / filter / config surface behaves exactly as
// for a plain text field.
//
// Taking a SCHEMA rather than a value tuple is what makes both of this repo's
// policies spellable: the strict `z.enum` for a closed engine-internal set, and
// a `tolerantEnum` for a set whose ids get renamed while old rows outlive them
// (`conversations.model` — see `model-provider/core`). A tuple form could only
// ever express the first.
//
// `default` is REQUIRED here: a general schema has no "first value" to fall back
// to, and a `defaultValue` that does not really parse would be a silent
// mis-backfill. `enumTextField` supplies it from the tuple.
export function parsedTextField<T extends string>(
  schema: ZodParser<T>,
  opts: FieldMeta & { default: T },
): FieldDef<T> {
  return Object.freeze({
    // True by construction now: the text storage arm really does produce `T`,
    // because `T` is inferred from `schema` and `schema` is what decodes the
    // column.
    type: textFieldType as FieldType<T>,
    schema,
    defaultValue: opts.default,
    meta: pickMeta(opts),
  });
}

// The closed-set sugar over `parsedTextField`. Pass a `readonly` tuple of the
// allowed values (e.g. a `MAIL_LABEL_TYPES` const array). `InferFieldValue` then
// reports the exact union, so a column built from this field and a `z.infer` of
// the same record agree by construction. `default` defaults to the first value.
export function enumTextField<const T extends readonly [string, ...string[]]>(
  values: T,
  opts?: FieldMeta & { default?: T[number] },
): FieldDef<T[number]> {
  return parsedTextField<T[number]>(z.enum(values), {
    ...opts,
    default: opts?.default ?? values[0],
  });
}
