import { z } from "zod";
import {
  defineFieldType,
  type FieldDef,
  type FieldMeta,
  type FieldType,
  type FieldsRecord,
  type InferFieldsObject,
} from "@plugins/config_v2/core";

export type ListItem<F extends FieldsRecord> = {
  id: string;
  rank: string;
} & InferFieldsObject<F>;

export const listFieldType = defineFieldType<ListItem<FieldsRecord>[]>("list");

export interface ListFieldDef<F extends FieldsRecord = FieldsRecord>
  extends FieldDef<ListItem<F>[]> {
  readonly itemFields: F;
}

export function isListFieldDef(field: FieldDef): field is ListFieldDef {
  return "itemFields" in field;
}

function pickMeta(opts?: FieldMeta): FieldMeta {
  return {
    label: opts?.label,
    description: opts?.description,
    placeholder: opts?.placeholder,
  };
}

export function listField<const F extends FieldsRecord>(
  opts: FieldMeta & {
    itemFields: F;
    default?: Array<InferFieldsObject<F>>;
  },
): ListFieldDef<F> {
  const subShape: z.ZodRawShape = {};
  for (const [key, field] of Object.entries(opts.itemFields)) {
    subShape[key] = field.schema;
  }

  const itemSchema = z
    .object({
      id: z.string().optional(),
      rank: z.string().optional(),
      ...subShape,
    })
    .passthrough();

  const schema = z.array(itemSchema);

  return Object.freeze({
    type: listFieldType as FieldType<ListItem<F>[]>,
    schema: schema as unknown as z.ZodType<ListItem<F>[]>,
    defaultValue: (opts.default ?? []) as ListItem<F>[],
    meta: pickMeta(opts),
    itemFields: opts.itemFields,
  });
}
