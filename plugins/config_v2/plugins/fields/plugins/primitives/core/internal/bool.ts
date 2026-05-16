import { z } from "zod";
import { defineFieldType, type FieldDef, type FieldMeta } from "@plugins/config_v2/core";
import { pickMeta } from "./pick-meta";

export const boolFieldType = defineFieldType<boolean>("bool");

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
