import { z } from "zod";
import {
  defineFieldType,
  type FieldDef,
  type FieldMeta,
} from "@plugins/config_v2/core";

export const stringListFieldType = defineFieldType<string[]>("string-list");

export interface StringListFieldDef extends FieldDef<string[]> {
  readonly type: typeof stringListFieldType;
}

export function stringListField(
  opts?: FieldMeta & { default?: string[] },
): StringListFieldDef {
  return Object.freeze({
    type: stringListFieldType,
    schema: z.array(z.string()),
    defaultValue: opts?.default ?? [],
    meta: {
      label: opts?.label,
      description: opts?.description,
      placeholder: opts?.placeholder,
    },
  });
}
