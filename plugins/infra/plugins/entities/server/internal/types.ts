import type { z } from "zod";
import type {
  $Type,
  BuildColumns,
  BuildExtraConfigColumns,
  ColumnBuilderBaseConfig,
  ColumnDataType,
  HasDefault,
  NotNull,
  SQL,
} from "drizzle-orm";
import type {
  AnyIndexBuilder,
  AnyPgColumn,
  PgColumnBuilderBase,
  PgTableWithColumns,
  UpdateDeleteAction,
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
  /** Opt-in foreign-key constraint on this column. */
  references?: EntityReference;
}

// ─── Foreign keys ──────────────────────────────────────────────────────────
// A column-level FK, declared opt-in per column via `meta.columns.<key>.references`.
// `column` is a LAZY thunk returning the target Drizzle column — exactly
// drizzle's own `.references(() => other.id)` shape — so it composes with the
// entity factory without any structural typing of the target entity:
//
//   columns: {
//     accountId: { references: { column: () => accounts.table.id, onDelete: "cascade" } },
//   }
//
// The thunk defers resolution until drizzle wires up FKs (after every table is
// built), so FORWARD references (target defined later) and SELF references
// (target is the entity being defined) both work. A self reference needs the
// `AnyPgColumn` return annotation to break TypeScript's circular inference,
// mirroring the raw-drizzle precedent:
//
//   parentId: { references: { column: (): AnyPgColumn => labels.table.id, onDelete: "set null" } }
//
// FKs touch only the DDL — never the select/insert row shape — so they are
// deliberately absent from `EntityColumns` (like `.primaryKey()`).
export interface EntityReference {
  /** Lazy target column, e.g. `() => accounts.table.id`. */
  column: () => AnyPgColumn;
  /** ON DELETE action; omitted ⇒ NO ACTION (drizzle default). */
  onDelete?: UpdateDeleteAction;
  /** ON UPDATE action; omitted ⇒ NO ACTION (drizzle default). */
  onUpdate?: UpdateDeleteAction;
}

// ─── The precise select-type cast target ───────────────────────────────────
// The runtime builders come from `resolveFieldStorage`, typed
// `(name) => PgColumnBuilderBase` — T erased. We assemble loosely, then cast
// the column map once to this mapped type so `pgTable`'s own `BuildColumns`
// infers the right select type. `$Type` brands `_.$type` (overriding the
// column data type with `InferFieldValue<F[K]>`, which already encodes `T |
// null` for a nullable field, so nullability rides along), and `NotNull`
// brands `_.notNull`.
//
// `$inferSelect` is keyed by the camelCase JS property (never the snake_case
// DB column name), which is exactly why it aligns with `z.infer<schema>`.
//
// `.primaryKey()` is deliberately omitted (it affects only the INSERT model,
// not select). DB defaults, in contrast, MUST be reflected: a column with a DB
// default — whether `.default(v)`, `.defaultNow()`, `.defaultRandom()`, or a
// PK with `defaultRandom()` — is OPTIONAL on insert, exactly as in a
// hand-written `pgTable`. The `D` param (keys carrying `meta.columns[k].default`)
// brands those with `HasDefault`, which touches ONLY `$inferInsert` and leaves
// the select type exact — so a loader inserting a row may omit DB-defaulted
// columns (`id`, timestamps, `[]` rings) without a type error.
export type EntityColumns<F extends FieldsRecord, D extends keyof F = never> = {
  [K in keyof F]: K extends D
    ? HasDefault<
        NotNull<
          $Type<
            PgColumnBuilderBase<ColumnBuilderBaseConfig<ColumnDataType, string>>,
            InferFieldValue<F[K]>
          >
        >
      >
    : NotNull<
        $Type<
          PgColumnBuilderBase<ColumnBuilderBaseConfig<ColumnDataType, string>>,
          InferFieldValue<F[K]>
        >
      >;
};

// The keys of `meta.columns` that carry a `default` — i.e. the columns with a
// DB default, which become optional on insert. Derived from the meta so the
// insert model can never drift from the actual `.default()` calls.
export type DefaultedKeys<F extends FieldsRecord, M extends EntityMeta<F>> =
  M["columns"] extends object
    ? {
        [K in keyof M["columns"]]: M["columns"][K] extends { default: unknown }
          ? K
          : never;
      }[keyof M["columns"]] &
        keyof F
    : never;

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

export interface Entity<F extends FieldsRecord, D extends keyof F = never> {
  readonly name: string;
  // Inferred from the `pgTable(...)` call so `db.select().from(entity.table)`
  // carries the real columnType/dataType `db.select()`/`.where()` need. The `D`
  // (DB-defaulted) keys ride through to `BuildColumns` so `$inferInsert` marks
  // them optional, while `$inferSelect` stays exact.
  readonly table: PgTableWithColumns<{
    name: string;
    schema: undefined;
    dialect: "pg";
    columns: BuildColumns<string, EntityColumns<F, D>, "pg">;
  }>;
  // = fieldsToZodObject(fields); keyed by JS prop like `$inferSelect`.
  readonly schema: z.ZodObject<{ [K in keyof F]: F[K]["schema"] }>;
}

// Sugar so consumers needn't import zod:
//   type SlowOpRow = EntityRow<typeof slowOps>;
export type EntityRow<E> =
  E extends Entity<infer F, infer _D> ? z.infer<Entity<F>["schema"]> : never;

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
