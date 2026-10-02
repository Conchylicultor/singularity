import { z } from "zod";
import { type FieldDef, type FieldMeta, pickMeta } from "@plugins/fields/core";
import { dynamicFlagsFieldType } from "@plugins/fields/plugins/dynamic-flags/core";

export interface DynamicFlagsFieldDef extends FieldDef<
  Record<string, boolean>
> {
  readonly type: typeof dynamicFlagsFieldType;
}

/**
 * A set of switches whose options are not known when the field is declared
 * (they come from runtime data — a live catalogue). Stored as a free-key
 * `Record<string, boolean>` holding only what the user set; the default is
 * `{}`, so the config origin lists no option and never changes when the
 * option set does. Each option's default lives on the option, contributed with
 * the set through `DynamicFlags.Options`; a reader applies it with
 * {@link flagValue}.
 */
export function dynamicFlagsField(opts?: FieldMeta): DynamicFlagsFieldDef {
  return Object.freeze({
    type: dynamicFlagsFieldType,
    schema: z.record(z.string(), z.boolean()),
    defaultValue: {},
    meta: pickMeta(opts),
  });
}

/** One switch's effective value: what the user set, else the option's default. */
export function flagValue(
  value: Readonly<Record<string, boolean>>,
  key: string,
  defaultOn: boolean,
): boolean {
  return value[key] ?? defaultOn;
}
