import type { PgTable } from "drizzle-orm/pg-core";
import type { ColumnWire } from "@plugins/database/plugins/sql-column/server";
import type {
  EntitySource,
  RoutedSource,
} from "@plugins/infra/plugins/query-resource/server";

// What a served collection reads from, and the type-level reads of it every
// single-table form shares — the window / lookup forms (`./serve-collection`)
// and the `all` form (`./serve-all`). A leaf: it imports neither, so the two
// never import each other's module for a binding.

/** A table, or an `infra/entities` Entity (read through its table). Never a view. */
export type CollectionSource = RoutedSource;

/** The table `from` reads. */
export type TableOf<T> = T extends EntitySource
  ? T["table"]
  : T extends PgTable
    ? T
    : never;

/** The columns `from` exposes, by property name. */
export type ColumnsOf<T> = T extends EntitySource
  ? T["wireColumns"]
  : T extends PgTable
    ? T["_"]["columns"]
    : never;

/** The column property names `from` exposes. */
export type ColumnNamesOf<T> = keyof ColumnsOf<T> & string;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * Row fields bound by name to a column that declares a wire form (sql-column's
 * `withWire`) whose wire type the field is not — e.g. a `bytea` column's field
 * typed as bytes instead of its base64 `string`.
 */
type WireMismatch<T, Row> = {
  [K in keyof Row & ColumnNamesOf<T>]: ColumnWire<ColumnsOf<T>[K]> extends {
    wire: infer W;
  }
    ? Same<Row[K], W> extends true
      ? never
      : K
    : never;
}[keyof Row & ColumnNamesOf<T>];

/** A wire-type mismatch is a REQUIRED property of type `never`, naming the field: a tsc error. */
export type WireCheck<T, Row> = [WireMismatch<T, Row>] extends [never]
  ? unknown
  : {
      [
        K in WireMismatch<T, Row> &
          string as `row field "${K}" must be its column's wire type (sql-column withWire)`
      ]: never;
    };

/** Whether `from` is an `infra/entities` Entity (read through its table). */
export function isEntitySource(from: CollectionSource): from is EntitySource {
  return "wireColumns" in from && "table" in from;
}
