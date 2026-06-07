import { z } from "zod";
import {
  type FieldDef,
  type FieldMeta,
  pickMeta,
} from "@plugins/config_v2/core";
import { textFieldType } from "@plugins/fields/plugins/text/core";

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
