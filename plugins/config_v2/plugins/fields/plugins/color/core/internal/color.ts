import { z } from "zod";
import {
  defineFieldType,
  type FieldDef,
  type FieldMeta,
} from "@plugins/config_v2/core";

export const colorFieldType = defineFieldType<string>("color");

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
    meta: {
      label: opts?.label,
      description: opts?.description,
      placeholder: opts?.placeholder,
    },
    swatches: opts?.swatches
      ? Object.freeze([...opts.swatches])
      : undefined,
    showAlpha: opts?.showAlpha,
  });
}
