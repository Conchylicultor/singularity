import { z } from "zod";
import { type FieldDef, type FieldMeta } from "@plugins/fields/core";
import { enumFieldType } from "@plugins/fields/plugins/enum/core";

export type EnumOptionInput = string | { value: string; label: string };

export interface EnumOption {
  readonly value: string;
  readonly label: string;
}

export interface EnumFieldDef extends FieldDef<string> {
  readonly type: typeof enumFieldType;
  readonly options: readonly EnumOption[];
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
    // No `display`. WHICH control a closed choice gets — rows in the panel's own
    // radio language, or a picker — is the panel's decision, made once against
    // one threshold. A field that could spell it would spell it wrong in
    // whichever surface it was not written for.
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
  });
}
