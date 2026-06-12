import { z } from "zod";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import type { FieldsRecord } from "./field-types";
import type { CollectionOptions, CollectionSchemas } from "./types";

export function buildSchemas<F extends FieldsRecord>(
  opts: CollectionOptions<F>,
): CollectionSchemas {
  const fieldShapes: z.ZodRawShape = {};
  const createShapes: z.ZodRawShape = {};
  const updateShapes: z.ZodRawShape = {};

  for (const [name, field] of Object.entries(opts.fields)) {
    fieldShapes[name] = field._zodSchema;
    createShapes[name] = field.required
      ? field._zodSchema
      : field._zodSchema.optional();
    updateShapes[name] = field._zodSchema.optional();
  }

  const rowSchema = z.object({
    id: z.string(),
    ...fieldShapes,
    ...(opts.ranked !== false ? { rank: RankSchema } : {}),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  });

  const createSchema = z.object(createShapes);
  const updateSchema = z.object(updateShapes);

  return { rowSchema, createSchema, updateSchema };
}
