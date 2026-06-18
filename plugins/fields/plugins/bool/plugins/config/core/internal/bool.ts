import { z } from "zod";
import {
  type FieldDef,
  type FieldMeta,
  pickMeta,
} from "@plugins/fields/core";
import { boolFieldType } from "@plugins/fields/plugins/bool/core";

export interface BoolFieldDef extends FieldDef<boolean> {
  readonly type: typeof boolFieldType;
}

export function boolField(
  opts?: FieldMeta & { default?: boolean },
): BoolFieldDef {
  return Object.freeze({
    type: boolFieldType,
    schema: z.boolean(),
    defaultValue: opts?.default ?? false,
    meta: pickMeta(opts),
  });
}
