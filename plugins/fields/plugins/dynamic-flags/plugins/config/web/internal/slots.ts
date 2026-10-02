import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { FieldDef } from "@plugins/fields/core";
import type { Hook } from "@plugins/framework/plugins/hook-value/core";

export interface DynamicFlagOption {
  readonly value: string;
  readonly label: string;
  /** The switch's state while the user has not set it (an absent key). */
  readonly defaultOn: boolean;
}

export interface DynamicFlagsOptionsContribution {
  field: FieldDef;
  useOptions: Hook<() => readonly DynamicFlagOption[]>;
}

export const DynamicFlags = {
  Options: defineSlot<DynamicFlagsOptionsContribution>({
    docLabel: (p) => p.field.meta.label ?? "dynamic-flags",
  }),
};
