import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { FieldDef } from "@plugins/fields/core";
import type { Hook } from "@plugins/framework/plugins/hook-value/core";

export interface DynamicEnumOption {
  readonly value: string;
  readonly label: string;
}

export interface DynamicEnumOptionsContribution {
  field: FieldDef;
  useOptions: Hook<() => readonly DynamicEnumOption[]>;
}

export const DynamicEnum = {
  Options: defineSlot<DynamicEnumOptionsContribution>({
    docLabel: (p) => p.field.meta.label ?? "dynamic-enum",
  }),
};
