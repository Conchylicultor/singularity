import type { FieldsRecord, InferFieldsObject } from "@plugins/fields/core";

/** Matches the `event_sources.type` column, the server registration, and the web slot id. */
export const MANUAL_SOURCE_TYPE_ID = "manual";

/**
 * A manual source has **no** configuration, and the empty record says so out loud
 * rather than by omission.
 *
 * There is nothing to point this type at: the user is the extractor, so every
 * knob a fetching type needs (an address, a credential, an extraction hint) has
 * no counterpart here. The list's own label lives on the source row
 * (`event_sources.name`, which every type has); adding a second `label` here
 * would be two names for one concept, which the app's naming discipline forbids.
 *
 * This is therefore the registry's zero-config case, and it is deliberately the
 * first one to exist: a `+` menu that renders an empty form as "nothing to
 * configure" is a `+` menu that will render every future type correctly.
 * `fieldsToZodObject({})` is `z.object({})`, which strips unknown keys — so a
 * manual source's `config` is always exactly `{}` no matter what a client posts.
 */
export const manualSourceConfigFields = {} satisfies FieldsRecord;

export type ManualSourceConfig = InferFieldsObject<typeof manualSourceConfigFields>;
