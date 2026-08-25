import { z } from "zod";
import { type FieldDef, type FieldMeta } from "@plugins/fields/core";
import { dynamicEnumFieldType } from "@plugins/fields/plugins/dynamic-enum/core";

export interface DynamicEnumFieldDef extends FieldDef<string> {
  readonly type: typeof dynamicEnumFieldType;
}

export function dynamicEnumField(
  // No `display`: presentation is the panel's, never the field's.
  opts?: FieldMeta & { default?: string },
): DynamicEnumFieldDef {
  return Object.freeze({
    type: dynamicEnumFieldType,
    schema: z.string(),
    defaultValue: opts?.default ?? "",
    meta: {
      label: opts?.label,
      description: opts?.description,
      placeholder: opts?.placeholder,
    },
  });
}
