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
  /** Opt-in: this type may be chosen when adding a custom DataView column. */
  readonly customColumn?: boolean;
  /** Projection to a sortable/comparable scalar (Date→ms, bool→0/1, …). */
  readonly coerce?: (value: T) => string | number | null;
  /**
   * Human-readable sort-direction labels for this type, mirroring Notion's
   * type-aware sort menu ("A → Z" / "Z → A" for text, "Newest first" for dates).
   * `asc`/`desc` map to the ascending/descending comparator. Inherited via the
   * `extends` chain (int/float reuse number's). Omitted → the generic
   * "Ascending" / "Descending" fallback.
   */
  readonly directionLabels?: { readonly asc: string; readonly desc: string };
}
