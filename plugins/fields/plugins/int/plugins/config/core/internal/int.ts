import { z } from "zod";
import {
  type FieldDef,
  type FieldMeta,
  pickMeta,
} from "@plugins/fields/core";
import { intFieldType } from "@plugins/fields/plugins/int/core";

export interface IntFieldDef extends FieldDef<number> {
  readonly type: typeof intFieldType;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export function intField(
  opts?: FieldMeta & {
    default?: number;
    min?: number;
    max?: number;
    step?: number;
  },
): IntFieldDef {
  let schema = z.number().int();
  if (opts?.min !== undefined) schema = schema.min(opts.min);
  if (opts?.max !== undefined) schema = schema.max(opts.max);

  return Object.freeze({
    type: intFieldType,
    schema,
    defaultValue: opts?.default ?? 0,
    meta: pickMeta(opts),
    min: opts?.min,
    max: opts?.max,
    step: opts?.step,
  });
}
