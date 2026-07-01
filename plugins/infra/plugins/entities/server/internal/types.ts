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

// A deeply-readonly view of `T`. `defineEntity` infers `meta` with a `const`
// type parameter (so a bare-literal default on a union-typed field can't collapse
// `DefaultedKeys` — see `define-entity.ts`), which makes a `{ default: [] }` /
// `{ default: {} }` literal `readonly`. Accepting `ReadonlyDeep<T>` for the bare
// default keeps those `[]` / `{}` ring defaults valid; the value is forwarded
// verbatim to drizzle's `.default()` at runtime (readonly arrays/objects are fine
// there).
type ReadonlyDeep<T> = T extends (infer U)[]
  ? readonly ReadonlyDeep<U>[]
  : T extends object
    ? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
    : T;

// Bare value is literal sugar (readonly-tolerant for `const`-inferred meta).
export type ColumnDefault<T> = T | ReadonlyDeep<T> | DbDefault<T>;

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
//
// `NotNull` is applied ONLY to non-nullable fields. A nullable field's value
// type includes `null` (`nullable(...)` ⇒ `InferFieldValue = T | null`), and the
// runtime (`define-entity.ts`) already skips `.notNull()` for it. Leaving the
// builder un-`NotNull` is what makes drizzle treat the column as OPTIONAL on
// insert (it defaults to NULL when omitted) while keeping the select type
// `T | null` — the `$type` brand already carries the `null`, so select is
// unchanged either way. Branding a nullable column `NotNull` (the prior
// unconditional behaviour) wrongly forced it required on every insert.
type EntityColumnBuilder<V> = $Type<
  PgColumnBuilderBase<ColumnBuilderBaseConfig<ColumnDataType, string>>,
  V
>;
type MaybeNotNull<V, B extends PgColumnBuilderBase> = [null] extends [V]
  ? B
  : NotNull<B>;
export type EntityColumns<F extends FieldsRecord, D extends keyof F = never> = {
  [K in keyof F]: K extends D
    ? HasDefault<
        MaybeNotNull<
          InferFieldValue<F[K]>,
          EntityColumnBuilder<InferFieldValue<F[K]>>
        >
      >
    : MaybeNotNull<
        InferFieldValue<F[K]>,
        EntityColumnBuilder<InferFieldValue<F[K]>>
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
  // `primaryKey({ columns })`; absent → no PK (junction / view-like). The array
  // is `readonly` so a `const`-inferred meta (see `defineEntity`) — which makes
  // a `["a","b"]` literal a `readonly` tuple — still satisfies the constraint.
  primaryKey?: (keyof F & string) | readonly (keyof F & string)[];
  columns?: { [K in keyof F]?: EntityColumnMeta<InferFieldValue<F[K]>> };
  // Wire-projection concern (distinct from the per-column DDL concerns above):
  // keys that stay in the table DDL but are OMITTED from the derived wire schema
  // (and from `wireColumns`, so the loader never even fetches them). Kept as a
  // top-level array — not a per-column flag — so the browser can import the
  // identical omit-list from the plugin's browser-safe `core/` and build its own
  // wire schema without re-declaring it (entities is server-only). Absent /
  // empty ⇒ every column is on the wire (unchanged behaviour).
  serverOnly?: readonly (keyof F & string)[];
  // Passthrough to pgTable's 3rd-arg callback; `t` is keyed by JS property
  // name. Merged with the composite-PK entry inside `defineEntity`.
  indexes?: (
    t: BuildExtraConfigColumns<string, EntityColumns<F>, "pg">,
  ) => AnyIndexBuilder[];
}

// The keys marked `serverOnly` in `meta` — the columns present in the table DDL
// but ABSENT from the wire schema / `wireColumns`. Mirrors `DefaultedKeys` but
// simpler: it reads the array element type directly. Absent ⇒ `never` (every
// column is on the wire).
export type ServerOnlyKeys<F extends FieldsRecord, M extends EntityMeta<F>> =
  M["serverOnly"] extends readonly (infer K)[] ? K & keyof F : never;

export interface Entity<
  F extends FieldsRecord,
  D extends keyof F = never,
  S extends keyof F = never,
> {
  readonly name: string;
  // Inferred from the `pgTable(...)` call so `db.select().from(entity.table)`
  // carries the real columnType/dataType `db.select()`/`.where()` need. The `D`
  // (DB-defaulted) keys ride through to `BuildColumns` so `$inferInsert` marks
  // them optional, while `$inferSelect` stays exact. UNCHANGED by `S` — the
  // server-only columns stay in the FULL table DDL.
  readonly table: PgTableWithColumns<{
    name: string;
    schema: undefined;
    dialect: "pg";
    columns: BuildColumns<string, EntityColumns<F, D>, "pg">;
  }>;
  // The WIRE schema = `wireSchema(fields, meta.serverOnly)`; keyed by JS prop
  // like `$inferSelect`, minus the server-only keys `S`. With `S = never`
  // (no server-only columns) this is `{ [K in keyof F]: F[K]["schema"] }` —
  // identical to before.
  readonly schema: z.ZodObject<{ [K in Exclude<keyof F, S>]: F[K]["schema"] }>;
  // The drizzle column-proxy subset the loader hands to `db.select(...)`: the
  // table's columns minus the server-only keys. `db.select(entity.wireColumns)
  // .from(entity.table)` never fetches the server-only columns, so they cannot
  // leak — and the inferred rows equal `z.infer<entity.schema>` by construction
  // (both are the full column/schema set with the same `S` keys removed). With
  // `S = never` this is the full `BuildColumns` map.
  readonly wireColumns: Pick<
    BuildColumns<string, EntityColumns<F, D>, "pg">,
    Exclude<keyof F, S>
  >;
}

// Sugar so consumers needn't import zod:
//   type SlowOpRow = EntityRow<typeof slowOps>;
// Inferred from the entity's OWN (already server-only-omitted) schema, so it is
// the wire row shape regardless of `S`.
export type EntityRow<E> =
  E extends { schema: z.ZodType<infer T> } ? T : never;

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
