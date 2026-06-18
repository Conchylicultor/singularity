import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { FieldDef } from "@plugins/fields/core";

export interface DynamicEnumOption {
  readonly value: string;
  readonly label: string;
}

export interface DynamicEnumOptionsContribution {
  field: FieldDef;
  useOptions: () => readonly DynamicEnumOption[];
}

export const DynamicEnum = {
  Options: defineSlot<DynamicEnumOptionsContribution>(
    "fields.dynamic-enum.options",
    { docLabel: (p) => p.field.meta.label ?? "dynamic-enum" },
  ),
};
