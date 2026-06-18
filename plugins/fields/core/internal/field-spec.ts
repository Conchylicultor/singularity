import type { z } from "zod";
import type { FieldType, FieldMeta } from "./types";

// The canonical field atom: bundles the type token (→ UI via the fields
// identity registry), the wire zod fragment, a default, and meta. `type`
// references the local `FieldType` — fields/core is the sink that owns it, so
// there is no cross-plugin import here. Kept named `FieldDef` (established
// across ~40 sites).
export interface FieldDef<T = unknown> {
  readonly type: FieldType<T>;
  readonly schema: z.ZodType<T>;
  readonly defaultValue: T;
  readonly meta: FieldMeta;
}

export type FieldsRecord = Record<string, FieldDef>;

export type InferFieldValue<F> = F extends FieldDef<infer T> ? T : never;

export type InferFieldsObject<F extends FieldsRecord> = {
  [K in keyof F]: InferFieldValue<F[K]>;
};
