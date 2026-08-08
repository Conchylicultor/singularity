import type {
  ColumnConfigDerive,
  FieldDef,
} from "@plugins/primitives/plugins/data-view/web";

export interface EnumOption {
  value: string;
  label: string;
}

/**
 * Narrow the opaque config blob to the `{ options }` shape enum understands.
 * This module is the ONLY place in the repo that may read it — the editor writes
 * it and `deriveEnumFieldDef` publishes it as a generic `FieldDef.options`.
 */
export function readOptions(config: unknown): EnumOption[] {
  return (config as { options?: EnumOption[] } | undefined)?.options ?? [];
}

/**
 * The enum type's custom-column projection: its private `config.options` becomes
 * the generic `FieldDef.options` every data-view consumer already reads (chip
 * cell, inline editor, filter input, group-by section label). Without it those
 * consumers see only the stored value — a minted option id, not the label.
 */
export const deriveEnumFieldDef: ColumnConfigDerive = (
  config,
): Partial<FieldDef<unknown>> => ({ options: readOptions(config) });
