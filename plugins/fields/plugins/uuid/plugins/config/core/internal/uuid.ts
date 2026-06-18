import { z } from "zod";
import { type FieldDef, type FieldMeta, pickMeta } from "@plugins/fields/core";
import { uuidFieldType } from "@plugins/fields/plugins/uuid/core";

export interface UuidFieldDef extends FieldDef<string> {
  readonly type: typeof uuidFieldType;
}

export function uuidField(opts?: FieldMeta & { default?: string }): UuidFieldDef {
  return Object.freeze({
    type: uuidFieldType,
    schema: z.string().uuid(),
    defaultValue: opts?.default ?? "",
    meta: pickMeta(opts),
  });
}
