import { z } from "zod";
import type { FieldDef, FieldsRecord } from "./field-spec";

// A missing key resolves to the field's own default, so adding a field to an
// existing config / list item / object is backward-compatible: documents that
// predate the field heal to its default instead of failing validation. Mirrors
// objectField, which already wraps its sub-fields this way. The single rule
// every FieldsRecord→z.object composition site shares.
//
// `.default()` feeds its value back through the inner parse, so zod wants it
// input-typed while `defaultValue` is output-typed (deliberately — see
// FieldDef). `defaultValue: T` still catches a plainly wrong default, but it no
// longer guarantees the default survives a re-parse. That only bites a field
// schema carrying a `.transform()`, of which there are none.
export function fieldSchemaWithDefault(field: FieldDef): z.ZodTypeAny {
  return field.schema.default(field.defaultValue);
}

// Derives a strict `z.object` from a FieldsRecord — each field wrapped with its
// default-backfill. Returns a plain object schema (NO `.passthrough()`): a
// strict base so the future `defineEntity` (Stage C) gets clean row validation.
// Consumers that need unknown-key tolerance (config_v2's `defineConfig`, across
// schema evolution) apply `.passthrough()` themselves at the call site.
export function fieldsToZodObject<F extends FieldsRecord>(
  fields: F,
): z.ZodObject<{ [K in keyof F]: F[K]["schema"] }> {
  const shape: z.ZodRawShape = {};
  for (const [key, field] of Object.entries(fields)) {
    shape[key] = fieldSchemaWithDefault(field);
  }
  return z.object(shape) as unknown as z.ZodObject<{
    [K in keyof F]: F[K]["schema"];
  }>;
}
