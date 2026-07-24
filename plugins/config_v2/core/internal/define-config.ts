import type { ConfigDescriptor, ConfigValues, ConfigSource } from "./types";
import type { FieldsRecord } from "@plugins/fields/core";
import { fieldsToZodObject } from "@plugins/fields/core";

export function defineConfig<const F extends FieldsRecord>(opts: {
  name?: string;
  fields: F;
  scope?: "app";
  promotableToGit?: boolean;
  source?: ConfigSource;
  requiresAuthoredOverride?: { guidance: string[] };
}): ConfigDescriptor<F> {
  for (const key of Object.keys(opts.fields)) {
    if (key.includes(".")) {
      throw new Error(
        `defineConfig: field name "${key}" must not contain "." (used as key separator).`,
      );
    }
  }

  // The seeded/re-marked override carries the descriptor's own prose as its
  // instructions — an empty `guidance` would produce a bare marker the author
  // has no way to act on, so it is a defect at declaration time, not a silent
  // degradation at build time.
  if (opts.requiresAuthoredOverride?.guidance.length === 0) {
    throw new Error(
      `defineConfig: "${opts.name ?? "config"}" sets requiresAuthoredOverride with empty guidance — supply the prose the author is meant to act on.`,
    );
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
    requiresAuthoredOverride: opts.requiresAuthoredOverride,
  });
}
