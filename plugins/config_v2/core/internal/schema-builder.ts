import { z } from "zod";
import type { FieldsRecord } from "./types";

export function buildFieldsSchema<F extends FieldsRecord>(
  fields: F,
): z.ZodObject<{ [K in keyof F]: F[K]["schema"] }> {
  const shape: z.ZodRawShape = {};
  for (const [key, field] of Object.entries(fields)) {
    shape[key] = field.schema;
  }
  return z.object(shape) as z.ZodObject<{ [K in keyof F]: F[K]["schema"] }>;
}
