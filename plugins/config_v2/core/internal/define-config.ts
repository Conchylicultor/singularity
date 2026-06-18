import type { ConfigDescriptor, ConfigValues, ConfigSource } from "./types";
import type { FieldsRecord } from "@plugins/fields/core";
import { fieldsToZodObject } from "@plugins/fields/core";

export function defineConfig<const F extends FieldsRecord>(opts: {
  name?: string;
  fields: F;
  scope?: "app";
  promotableToGit?: boolean;
  source?: ConfigSource;
}): ConfigDescriptor<F> {
  for (const key of Object.keys(opts.fields)) {
    if (key.includes(".")) {
      throw new Error(
        `defineConfig: field name "${key}" must not contain "." (used as key separator).`,
      );
    }
  }

  // .passthrough() for parity with object/list: unknown keys are preserved, not
  // stripped (redaction/tiers iterate descriptor.fields explicitly anyway).
  // `fieldsToZodObject` returns a STRICT object — config applies passthrough
  // here, where the old `buildFieldsSchema` used to bake it in.
  const schema = fieldsToZodObject(opts.fields).passthrough();

  const defaults = Object.fromEntries(
    Object.entries(opts.fields).map(([k, f]) => [k, f.defaultValue]),
  ) as ConfigValues<F>;

  return Object.freeze({
    name: opts.name ?? "config",
    schema,
    fields: opts.fields,
    defaults,
    scope: opts.scope,
    promotableToGit: opts.promotableToGit,
    source: opts.source ?? "manual",
  });
}
