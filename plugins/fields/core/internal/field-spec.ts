import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import type { FieldType, FieldMeta } from "./types";

// The canonical field atom: bundles the type token (→ UI via the fields
// identity registry), the wire zod fragment, a default, and meta. `type`
// references the local `FieldType`, which fields/core owns; the only import
// that leaves this plugin is the `ZodParser` alias, a `packages/…` leaf that
// pulls in nothing but zod's types. Kept named `FieldDef` (established across
// ~40 sites).
export interface FieldDef<T = unknown> {
  readonly type: FieldType<T>;
  /**
   * A field schema parses jsonb / JSON / wire — never a value already of type
   * `T` — so it is input-`unknown` by construction. That is what makes
   * `.default()`, `.catch()`, `.coerce()` and `.transform()` usable inside a
   * field schema.
   */
  readonly schema: ZodParser<T>;
  /**
   * Output-typed on purpose: `defaultValue` is read as a live `T` throughout
   * the repo (it seeds form values, and in config_v2 it *is* the config value).
   * See the re-parse note on `fieldSchemaWithDefault`.
   */
  readonly defaultValue: T;
  readonly meta: FieldMeta;
}

export type FieldsRecord = Record<string, FieldDef>;

export type InferFieldValue<F> = F extends FieldDef<infer T> ? T : never;

export type InferFieldsObject<F extends FieldsRecord> = {
  [K in keyof F]: InferFieldValue<F[K]>;
};
