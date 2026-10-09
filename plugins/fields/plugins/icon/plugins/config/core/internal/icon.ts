import { type FieldDef, type FieldMeta, pickMeta } from "@plugins/fields/core";
import { iconFieldType } from "@plugins/fields/plugins/icon/core";
import type { SavedSymbolName } from "@plugins/ui/plugins/icons/core";
import { SavedSymbolNameSchema } from "@plugins/ui/plugins/icons/plugins/saved-names/core";

export interface IconFieldDef extends FieldDef<SavedSymbolName | null> {
  readonly type: typeof iconFieldType;
}

export function iconField(
  opts?: FieldMeta & { default?: SavedSymbolName | null },
): IconFieldDef {
  return Object.freeze({
    type: iconFieldType,
    schema: SavedSymbolNameSchema.nullable(),
    defaultValue: opts?.default ?? null,
    meta: pickMeta(opts),
  });
}
