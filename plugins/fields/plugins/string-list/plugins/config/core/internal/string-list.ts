import { z } from "zod";
import {
  pickMeta,
  type FieldDef,
  type FieldMeta,
} from "@plugins/config_v2/core";
import { stringListFieldType } from "@plugins/fields/plugins/string-list/core";

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
    meta: pickMeta(opts),
  });
}
