import type { z } from "zod";
import type {
  $Type,
  BuildColumns,
  BuildExtraConfigColumns,
  ColumnBuilderBaseConfig,
  ColumnDataType,
  NotNull,
  SQL,
} from "drizzle-orm";
import type {
  AnyIndexBuilder,
  PgColumnBuilderBase,
  PgTableWithColumns,
} from "drizzle-orm/pg-core";
import type { FieldsRecord, InferFieldValue } from "@plugins/fields/core";

// ─── Storage-only DB defaults ──────────────────────────────────────────────
// A DB-column default is a DISTINCT concept from a field's wire/backfill
// default (`field.defaultValue`). ABSENT here ⇒ the column has NO DB default,
// even when the field carries a wire default (e.g. `worktree` defaults to `""`
// on the wire but has no DB default). DB defaults are therefore OPT-IN per
// column via `meta.columns.<key>.default`.
export type DbDefault<T> =
  | { kind: "literal"; value: T } // .default(value)
  | { kind: "now" } //              .defaultNow()    (timestamp only)
  | { kind: "random" } //           .defaultRandom() (uuid only)
  | { kind: "sql"; sql: SQL }; //   .default(sql`...`)

// Bare value is literal sugar.
export type ColumnDefault<T> = T | DbDefault<T>;

export interface EntityColumnMeta<T> {
  /** DB column name; default = snakeCase(key). */
  name?: string;
  /** Opt-in DB-column default. */
  default?: ColumnDefault<T>;
}

// ─── The precise select-type cast target ───────────────────────────────────
// The runtime builders come from `resolveFieldStorage`, typed
// `(name) => PgColumnBuilderBase` — T erased. We assemble loosely, then cast
// the column map once to this mapped type so `pgTable`'s own `BuildColumns`
// infers the right select type. `$Type` brands `_.$type` (overriding the
// column data type with `InferFieldValue<F[K]>`, which already encodes `T |
// null` for a nullable field, so nullability rides along), and `NotNull`
// brands `_.notNull`. `.default()`/`.primaryKey()` affect only the INSERT
// model, so they are deliberately omitted here to keep the select type exact.
// `$inferSelect` is keyed by the camelCase JS property (never the snake_case
// DB column name), which is exactly why it aligns with `z.infer<schema>`.
export type EntityColumns<F extends FieldsRecord> = {
  [K in keyof F]: NotNull<
    $Type<
      PgColumnBuilderBase<ColumnBuilderBaseConfig<ColumnDataType, string>>,
      InferFieldValue<F[K]>
    >
  >;
};

export interface EntityMeta<F extends FieldsRecord> {
  // Single key → `.primaryKey()` on the column; array → composite
  // `primaryKey({ columns })`; absent → no PK (junction / view-like).
  primaryKey?: (keyof F & string) | (keyof F & string)[];
  columns?: { [K in keyof F]?: EntityColumnMeta<InferFieldValue<F[K]>> };
  // Passthrough to pgTable's 3rd-arg callback; `t` is keyed by JS property
  // name. Merged with the composite-PK entry inside `defineEntity`.
  indexes?: (
    t: BuildExtraConfigColumns<string, EntityColumns<F>, "pg">,
  ) => AnyIndexBuilder[];
}

export interface Entity<F extends FieldsRecord> {
  readonly name: string;
  // Inferred from the `pgTable(...)` call so `db.select().from(entity.table)`
  // carries the real columnType/dataType `db.select()`/`.where()` need.
  readonly table: PgTableWithColumns<{
    name: string;
    schema: undefined;
    dialect: "pg";
    columns: BuildColumns<string, EntityColumns<F>, "pg">;
  }>;
  // = fieldsToZodObject(fields); keyed by JS prop like `$inferSelect`.
  readonly schema: z.ZodObject<{ [K in keyof F]: F[K]["schema"] }>;
}

// Sugar so consumers needn't import zod:
//   type SlowOpRow = EntityRow<typeof slowOps>;
export type EntityRow<E> =
  E extends Entity<infer F> ? z.infer<Entity<F>["schema"]> : never;

// ─── Default-marker constructors ───────────────────────────────────────────
export function defaultNow(): DbDefault<never> {
  return { kind: "now" };
}

export function defaultRandom(): DbDefault<never> {
  return { kind: "random" };
}

export function sqlDefault<T>(sql: SQL): DbDefault<T> {
  return { kind: "sql", sql };
}
