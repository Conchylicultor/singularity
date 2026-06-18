import { z } from "zod";
import {
  fieldSchemaWithDefault,
  type FieldDef,
  type FieldMeta,
  type FieldsRecord,
  type FieldType,
  type InferFieldsObject,
} from "@plugins/fields/core";
import { objectFieldType } from "@plugins/fields/plugins/object/core";

export interface ObjectFieldDef<F extends FieldsRecord = FieldsRecord>
  extends FieldDef<InferFieldsObject<F>> {
  readonly subFields: F;
}

export function isObjectFieldDef(field: FieldDef): field is ObjectFieldDef {
  return "subFields" in field;
}

function pickMeta(opts?: FieldMeta): FieldMeta {
  return {
    label: opts?.label,
    description: opts?.description,
    placeholder: opts?.placeholder,
  };
}

export function objectField<const F extends FieldsRecord>(
  opts: FieldMeta & {
    subFields: F;
    default?: InferFieldsObject<F>;
  },
): ObjectFieldDef<F> {
  const subShape: z.ZodRawShape = {};
  for (const [key, field] of Object.entries(opts.subFields)) {
    subShape[key] = fieldSchemaWithDefault(field);
  }

  const schema = z.object(subShape).passthrough();

  const defaultValue =
    opts.default != null
      ? { ...(opts.default as Record<string, unknown>) }
      : Object.fromEntries(
          Object.entries(opts.subFields).map(([k, f]) => [k, f.defaultValue]),
        );

  return Object.freeze({
    type: objectFieldType as FieldType<InferFieldsObject<F>>,
    schema: schema as unknown as z.ZodType<InferFieldsObject<F>>,
    defaultValue: defaultValue as InferFieldsObject<F>,
    meta: pickMeta(opts),
    subFields: opts.subFields,
  });
}
