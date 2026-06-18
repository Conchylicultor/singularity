import { z } from "zod";
import { type FieldDef, type FieldMeta, pickMeta } from "@plugins/fields/core";
import { dateFieldType } from "@plugins/fields/plugins/date/core";

export interface DateFieldDef extends FieldDef<Date> {
  readonly type: typeof dateFieldType;
}

export function dateField(opts?: FieldMeta & { default?: Date }): DateFieldDef {
  return Object.freeze({
    type: dateFieldType,
    schema: z.coerce.date(),
    defaultValue: opts?.default ?? new Date(0),
    meta: pickMeta(opts),
  });
}
