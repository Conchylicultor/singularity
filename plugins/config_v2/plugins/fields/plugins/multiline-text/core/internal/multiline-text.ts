import { z } from "zod";
import {
  defineFieldType,
  type FieldDef,
  type FieldMeta,
} from "@plugins/config_v2/core";

export const multilineTextFieldType =
  defineFieldType<string>("multiline-text");

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
    meta: {
      label: opts?.label,
      description: opts?.description,
      placeholder: opts?.placeholder,
    },
    rows: opts?.rows,
  });
}
