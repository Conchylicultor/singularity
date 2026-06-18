import { z } from "zod";
import {
  type FieldDef,
  type FieldMeta,
  pickMeta,
} from "@plugins/fields/core";
import { colorFieldType } from "@plugins/fields/plugins/color/core";

export interface ColorFieldDef extends FieldDef<string> {
  readonly type: typeof colorFieldType;
  readonly swatches?: readonly string[];
  readonly showAlpha?: boolean;
}

export function colorField(
  opts?: FieldMeta & {
    default?: string;
    swatches?: string[];
    showAlpha?: boolean;
  },
): ColorFieldDef {
  return Object.freeze({
    type: colorFieldType,
    schema: z.string(),
    defaultValue: opts?.default ?? "oklch(0 0 0)",
    meta: pickMeta(opts),
    swatches: opts?.swatches
      ? Object.freeze([...opts.swatches])
      : undefined,
    showAlpha: opts?.showAlpha,
  });
}
