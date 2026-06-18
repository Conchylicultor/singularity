import { z } from "zod";
import type { FieldDef, FieldMeta } from "@plugins/fields/core";
import { secretFieldType } from "@plugins/fields/plugins/secret/core";

export interface SecretFieldDef extends FieldDef<string> {
  readonly type: typeof secretFieldType;
}

export function secretField(
  opts?: FieldMeta,
): SecretFieldDef {
  return Object.freeze({
    type: secretFieldType,
    schema: z.string(),
    defaultValue: "",
    meta: { label: opts?.label, description: opts?.description, placeholder: opts?.placeholder },
  });
}
