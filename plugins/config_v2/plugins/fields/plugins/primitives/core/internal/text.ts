import { z } from "zod";
import { defineFieldType, type FieldDef, type FieldMeta } from "@plugins/config_v2/core";
import { pickMeta } from "./pick-meta";

export const textFieldType = defineFieldType<string>("text");

export interface TextFieldDef extends FieldDef<string> {
  readonly type: typeof textFieldType;
}

export function textField(
  opts?: FieldMeta & { default?: string },
): TextFieldDef {
  return Object.freeze({
    type: textFieldType,
    schema: z.string(),
    defaultValue: opts?.default ?? "",
    meta: pickMeta(opts),
  });
}
