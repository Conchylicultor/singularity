import type { PgColumnBuilderBase } from "drizzle-orm/pg-core";
import type { z } from "zod";
import type { Rank } from "@plugins/primitives/plugins/rank/core";

export interface FieldInstance<T> {
  readonly kind: string;
  readonly required: boolean;
  readonly label?: string;
  readonly defaultValue: T;
  readonly _columns: (name: string) => Record<string, PgColumnBuilderBase>;
  readonly _zodSchema: z.ZodType<T>;
  readonly _features?: { attachments?: boolean };
}

export function createFieldInstance<T, R extends boolean = false>(def: {
  kind: string;
  required?: R;
  label?: string;
  defaultValue: T;
  columns: (name: string) => Record<string, PgColumnBuilderBase>;
  zodSchema: z.ZodType<T>;
  features?: { attachments?: boolean };
}): FieldInstance<T> & { readonly required: R } {
  return Object.freeze({
    kind: def.kind,
    required: (def.required ?? false) as R,
    label: def.label,
    defaultValue: def.defaultValue,
    _columns: def.columns,
    _zodSchema: def.zodSchema,
    _features: def.features,
  });
}

export type FieldsRecord = Record<string, FieldInstance<unknown>>;

type InferFieldValue<F extends FieldInstance<unknown>> =
  F extends FieldInstance<infer T> ? T : never;

export type InferFieldsRow<F extends FieldsRecord> = {
  [K in keyof F]: InferFieldValue<F[K]>;
};

export type InferRow<F extends FieldsRecord> = {
  id: string;
  rank: Rank;
  createdAt: Date;
  updatedAt: Date;
} & InferFieldsRow<F>;

type RequiredFieldKeys<F extends FieldsRecord> = {
  [K in keyof F]: F[K]["required"] extends true ? K : never;
}[keyof F];

type OptionalFieldKeys<F extends FieldsRecord> = {
  [K in keyof F]: F[K]["required"] extends true ? never : K;
}[keyof F];

export type InferCreateInput<F extends FieldsRecord> = {
  [K in RequiredFieldKeys<F>]: InferFieldValue<F[K]>;
} & {
  [K in OptionalFieldKeys<F>]?: InferFieldValue<F[K]>;
};

export type InferUpdatePatch<F extends FieldsRecord> = {
  [K in keyof F]?: InferFieldValue<F[K]>;
};
