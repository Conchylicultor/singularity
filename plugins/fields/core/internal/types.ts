import type { ComponentType } from "react";

export interface FieldType<T = unknown> {
  readonly id: string;
  /** Phantom — inference only, never present at runtime. */
  readonly _T?: T;
}

export interface FieldMeta {
  label?: string;
  description?: string;
  placeholder?: string;
  typeHint?: string;
}

export interface FieldIdentity<T = unknown> {
  readonly type: FieldType<T>;
  readonly label?: string;
  readonly icon?: ComponentType<{ className?: string }>;
  /** Base type whose table/filter contributions this type inherits (one hop in practice). */
  readonly extends?: FieldType;
  /** Projection to a sortable/comparable scalar (Date→ms, bool→0/1, …). */
  readonly coerce?: (value: T) => string | number | null;
}
