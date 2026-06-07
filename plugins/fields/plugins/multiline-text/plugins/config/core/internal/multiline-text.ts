import { z } from "zod";
import {
  type FieldDef,
  type FieldMeta,
  pickMeta,
} from "@plugins/config_v2/core";
import { multilineTextFieldType } from "@plugins/fields/plugins/multiline-text/core";

export interface MultilineTextFieldDef extends FieldDef<string> {
  readonly type: typeof multilineTextFieldType;
  readonly rows?: number;
}

export function multilineTextField(
  opts?: FieldMeta & { default?: string; rows?: number },
): MultilineTextFieldDef {
  return Object.freeze({
    type: multilineTextFieldType,
    schema: z.string(),
    defaultValue: opts?.default ?? "",
    meta: pickMeta(opts),
    rows: opts?.rows,
  });
}
