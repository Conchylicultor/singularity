import { z } from "zod";
import { defineFieldType, type FieldDef, type FieldMeta } from "@plugins/config_v2/core";

export const secretFieldType = defineFieldType<string>("secret");

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
