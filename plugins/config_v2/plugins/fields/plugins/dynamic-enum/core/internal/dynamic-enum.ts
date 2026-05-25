import { z } from "zod";
import {
  defineFieldType,
  type FieldDef,
  type FieldMeta,
} from "@plugins/config_v2/core";

export const dynamicEnumFieldType = defineFieldType<string>("dynamic-enum");

export interface DynamicEnumFieldDef extends FieldDef<string> {
  readonly type: typeof dynamicEnumFieldType;
  readonly display?: "radio" | "dropdown";
}

export function dynamicEnumField(
  opts?: FieldMeta & { default?: string; display?: "radio" | "dropdown" },
): DynamicEnumFieldDef {
  return Object.freeze({
    type: dynamicEnumFieldType,
    schema: z.string(),
    defaultValue: opts?.default ?? "",
    meta: {
      label: opts?.label,
      description: opts?.description,
      placeholder: opts?.placeholder,
    },
    display: opts?.display,
  });
}
