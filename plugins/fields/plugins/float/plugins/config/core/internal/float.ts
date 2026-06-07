import { z } from "zod";
import {
  type FieldDef,
  type FieldMeta,
  pickMeta,
} from "@plugins/config_v2/core";
import { floatFieldType } from "@plugins/fields/plugins/float/core";

export interface FloatFieldDef extends FieldDef<number> {
  readonly type: typeof floatFieldType;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export function floatField(
  opts?: FieldMeta & {
    default?: number;
    min?: number;
    max?: number;
    step?: number;
  },
): FloatFieldDef {
  let schema = z.number();
  if (opts?.min !== undefined) schema = schema.min(opts.min);
  if (opts?.max !== undefined) schema = schema.max(opts.max);

  return Object.freeze({
    type: floatFieldType,
    schema,
    defaultValue: opts?.default ?? 0,
    meta: pickMeta(opts),
    min: opts?.min,
    max: opts?.max,
    step: opts?.step,
  });
}
