import type { z } from "zod";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface Disposable {
  dispose(): void;
}

export interface FieldMeta {
  label?: string;
  description?: string;
  placeholder?: string;
  typeHint?: string;
}

export interface FieldType<T = unknown> {
  readonly id: string;
  readonly _T?: T;
}

export function defineFieldType<T>(id: string): FieldType<T> {
  return Object.freeze({ id });
}

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

export type ConfigValues<F extends FieldsRecord> = InferFieldsObject<F>;

export interface ConfigDescriptor<F extends FieldsRecord = FieldsRecord> {
  readonly name: string;
  readonly schema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  readonly fields: F;
  readonly defaults: ConfigValues<F>;
}
