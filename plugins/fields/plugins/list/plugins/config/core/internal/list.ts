import { z } from "zod";
import {
  fieldSchemaWithDefault,
  type FieldDef,
  type FieldMeta,
  type FieldsRecord,
  type InferFieldsObject,
} from "@plugins/config_v2/core";
import type { FieldType } from "@plugins/fields/core";
import { listFieldType, type ListItem } from "@plugins/fields/plugins/list/core";

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
    // Seeded defaults may carry the list item's stable `id` / `rank` identity
    // (both optional, exactly as the stored schema permits) so a code-authored
    // default row is editable + ordered without waiting for a UI "Add".
    default?: Array<InferFieldsObject<F> & { id?: string; rank?: string }>;
  },
): ListFieldDef<F> {
  const subShape: z.ZodRawShape = {};
  for (const [key, field] of Object.entries(opts.itemFields)) {
    // A missing item key (e.g. a field added after items were stored) heals to
    // the field's default instead of failing the whole list's validation.
    subShape[key] = fieldSchemaWithDefault(field);
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
