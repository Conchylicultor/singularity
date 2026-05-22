import { z } from "zod";
import {
  defineFieldType,
  type FieldDef,
  type FieldMeta,
} from "@plugins/config_v2/core";

export type EnumOptionInput = string | { value: string; label: string };

export interface EnumOption {
  readonly value: string;
  readonly label: string;
}

export const enumFieldType = defineFieldType<string>("enum");

export interface EnumFieldDef extends FieldDef<string> {
  readonly type: typeof enumFieldType;
  readonly options: readonly EnumOption[];
  readonly display?: "radio" | "dropdown";
}

function normalizeOption(input: EnumOptionInput): EnumOption {
  return typeof input === "string"
    ? { value: input, label: input }
    : { value: input.value, label: input.label };
}

export function enumField(
  opts: FieldMeta & {
    options: EnumOptionInput[];
    default?: string;
    display?: "radio" | "dropdown";
  },
): EnumFieldDef {
  if (opts.options.length === 0) {
    throw new Error("enumField requires at least one option");
  }

  const options = opts.options.map(normalizeOption);
  const values = options.map((o) => o.value) as [string, ...string[]];

  return Object.freeze({
    type: enumFieldType,
    schema: z.enum(values),
    defaultValue: opts.default ?? options[0]!.value,
    meta: {
      label: opts.label,
      description: opts.description,
      placeholder: opts.placeholder,
      typeHint: `Allowed values: ${options.map((o) => JSON.stringify(o.value)).join(", ")}`,
    },
    options,
    display: opts.display,
  });
}
