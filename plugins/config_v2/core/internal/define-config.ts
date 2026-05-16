import type { FieldsRecord, ConfigDescriptor, ConfigValues } from "./types";
import { buildFieldsSchema } from "./schema-builder";

export function defineConfig<const F extends FieldsRecord>(opts: {
  name?: string;
  fields: F;
}): ConfigDescriptor<F> {
  for (const key of Object.keys(opts.fields)) {
    if (key.includes(".")) {
      throw new Error(
        `defineConfig: field name "${key}" must not contain "." (used as key separator).`,
      );
    }
  }

  const schema = buildFieldsSchema(opts.fields);

  const defaults = Object.fromEntries(
    Object.entries(opts.fields).map(([k, f]) => [k, f.defaultValue]),
  ) as ConfigValues<F>;

  return Object.freeze({ name: opts.name ?? "config", schema, fields: opts.fields, defaults });
}
