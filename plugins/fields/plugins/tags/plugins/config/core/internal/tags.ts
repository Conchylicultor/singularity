import { z } from "zod";
import { type FieldDef, type FieldMeta } from "@plugins/fields/core";
import { tagsFieldType } from "@plugins/fields/plugins/tags/core";

/** Accepted the same two ways `enumField` accepts an option: bare value, or value + label. */
export type TagsOptionInput = string | { value: string; label: string };

export interface TagsOption {
  readonly value: string;
  readonly label: string;
}

export interface TagsFieldDef extends FieldDef<string[]> {
  readonly type: typeof tagsFieldType;
  /** What the user can PICK. Not what the stored value must be — see below. */
  readonly options: readonly TagsOption[];
}

function normalizeOption(input: TagsOptionInput): TagsOption {
  return typeof input === "string"
    ? { value: input, label: input }
    : { value: input.value, label: input.label };
}

/**
 * A multi-select over a suggested option set — the multi-valued sibling of
 * `enumField`.
 *
 * ## Why the schema is `string[]` and not `z.enum(options)[]`
 *
 * `options` is the pickable set at *declaration* time, and for the interesting
 * consumers (a scraped site's dance styles, levels, teachers) that set is a
 * snapshot of a live catalogue someone re-copies each season. Pinning the schema
 * to it would mean that editing the list invalidates every stored value it drops
 * — a config that parsed yesterday failing to load today, with the user's own
 * selection as the casualty. So the value is any `string[]`, `options` is the
 * menu, and a selected value no longer on the menu is kept, rendered, and
 * de-selectable rather than silently discarded.
 *
 * That is a deliberate weakening of rung 2 for this one type. The strength has
 * to come back from the consumer: a filter value that matches nothing is
 * something only the consumer can see, so it is the consumer's job to say so out
 * loud (the SalsaNueva source type reports it in the run's caveats).
 *
 * What "empty" MEANS is likewise the consumer's, not the field's: pass it in
 * `description`.
 */
export function tagsField(
  opts: FieldMeta & { options: TagsOptionInput[]; default?: string[] },
): TagsFieldDef {
  if (opts.options.length === 0) {
    throw new Error("tagsField requires at least one option");
  }
  const options = opts.options.map(normalizeOption);
  return Object.freeze({
    type: tagsFieldType,
    schema: z.array(z.string()),
    defaultValue: opts.default ?? [],
    meta: {
      label: opts.label,
      description: opts.description,
      placeholder: opts.placeholder,
      // "Suggested", not "Allowed": the schema accepts any string, and saying
      // "allowed" here would describe a constraint that does not exist.
      typeHint: `Suggested values: ${options.map((o) => JSON.stringify(o.value)).join(", ")}`,
    },
    options,
  });
}
