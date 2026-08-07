import type { z } from "zod";
import type { FieldType, FieldMeta } from "./types";

// The canonical field atom: bundles the type token (→ UI via the fields
// identity registry), the wire zod fragment, a default, and meta. `type`
// references the local `FieldType` — fields/core is the sink that owns it, so
// there is no cross-plugin import here. Kept named `FieldDef` (established
// across ~40 sites).
export interface FieldDef<T = unknown> {
  readonly type: FieldType<T>;
  /**
   * KNOWN LIMITATION — `z.ZodType<T>` is `ZodType<T, ZodTypeDef, T>`, so a
   * field's schema must have input === output. Any schema carrying an inner
   * `.default()` or `.catch()` is therefore unusable here, because those are
   * exactly the combinators whose input is wider than their output. Work around
   * it by making the key `.optional()` and normalizing at the point of use (see
   * `RecurrenceRuleSchema.interval` in `apps/events/event-date`).
   *
   * Widening this to `z.ZodType<T, z.ZodTypeDef, unknown>` — the accurate type,
   * since a field parses jsonb/JSON/wire, never a value already of type `T` — is
   * NOT a one-liner: `fieldsToZodObject` then infers `_input` as `unknown` per
   * key, which breaks every `resourceDescriptor`/endpoint site that takes a
   * `ZodType<T>` built from a field record. Fixing it properly means widening
   * that chain too.
   */
  readonly schema: z.ZodType<T>;
  readonly defaultValue: T;
  readonly meta: FieldMeta;
}

export type FieldsRecord = Record<string, FieldDef>;

export type InferFieldValue<F> = F extends FieldDef<infer T> ? T : never;

export type InferFieldsObject<F extends FieldsRecord> = {
  [K in keyof F]: InferFieldValue<F[K]>;
};
