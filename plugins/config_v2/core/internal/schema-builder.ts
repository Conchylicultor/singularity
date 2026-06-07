import { z } from "zod";
import type { FieldDef, FieldsRecord } from "./types";

// A missing key resolves to the field's own default, so adding a field to an
// existing config / list item / object is backward-compatible: documents that
// predate the field heal to its default instead of failing validation. Mirrors
// objectField, which already wraps its sub-fields this way. The single rule
// every FieldsRecord→z.object composition site shares.
export function fieldSchemaWithDefault(field: FieldDef): z.ZodTypeAny {
  return field.schema.default(field.defaultValue);
}

export function buildFieldsSchema<F extends FieldsRecord>(
  fields: F,
): z.ZodObject<{ [K in keyof F]: F[K]["schema"] }> {
  const shape: z.ZodRawShape = {};
  for (const [key, field] of Object.entries(fields)) {
    shape[key] = fieldSchemaWithDefault(field);
  }
  // .passthrough() for parity with object/list: unknown keys are preserved, not
  // stripped (redaction/tiers iterate descriptor.fields explicitly anyway).
  return z.object(shape).passthrough() as unknown as z.ZodObject<{
    [K in keyof F]: F[K]["schema"];
  }>;
}
