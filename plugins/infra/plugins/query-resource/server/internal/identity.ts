import { Column, getTableColumns, is } from "drizzle-orm";
import {
  PgTable,
  PgView,
  getTableConfig,
  getViewConfig,
  type PgColumn,
} from "drizzle-orm/pg-core";
import type { EntitySource, QuerySource, SelectMap } from "./spec";

// The resolved identity of a query source: the base table its change scopes to,
// the relation to select from, the single-column primary key, the client
// keyField (the JS/alias key the pk is exposed under on the wire), and the
// projection (undefined ⇒ select-all).
export interface ResolvedIdentity {
  tableName: string;
  rel: PgTable | PgView;
  pkColumn: PgColumn;
  keyField: string;
  selectMap?: SelectMap;
  /**
   * The relation's full column record (JS property name → column) — the wire
   * field namespace when no projection is declared. Lets consumers resolve
   * OTHER columns' wire fields with `wireFieldFor` (compile-window's
   * order-signature derivation) without re-deriving the source shape.
   */
  columns: Record<string, PgColumn>;
}

// Structural entity detection — an `infra/entities` Entity is the only source
// shape carrying all four of these; a raw PgTable/PgView carries none of
// `wireColumns`. (See the collection-consumer note: we detect by shape, never by
// importing the concrete entity type.)
function isEntitySource(from: QuerySource): from is EntitySource {
  return (
    typeof from === "object" &&
    from !== null &&
    "table" in from &&
    "name" in from &&
    "wireColumns" in from &&
    "schema" in from
  );
}

// The single primary-key column of a table, or a loud throw. A composite PK
// (declared via `primaryKey({ columns })`) or >1 inline `.primaryKey()` cannot
// key a single-column keyed resource — the caller must pass `identity.pk` to
// pick one, or keep the resource on a plain push `defineResource`.
function singlePrimary(
  table: PgTable,
  columns: Record<string, PgColumn>,
  label: string,
): PgColumn {
  const primaries = Object.values(columns).filter((c) => c.primary);
  const compositeWide = getTableConfig(table).primaryKeys.some(
    (pk) => pk.columns.length > 1,
  );
  if (compositeWide || primaries.length > 1) {
    throw new Error(
      `queryResource: ${label} has a composite primary key — a keyed resource ` +
        `needs a single-column identity. Pass identity.pk to pick one, or keep ` +
        `this resource on a plain push defineResource.`,
    );
  }
  if (primaries.length === 0) {
    throw new Error(
      `queryResource: ${label} has no primary-key column — cannot derive a keyed ` +
        `identity. Pass identity.pk, or keep this on a plain push defineResource.`,
    );
  }
  return primaries[0]!;
}

/**
 * The JS/alias key under which `column` is projected, or undefined when it is
 * not projected. Matched by column identity OR DB column NAME (view columns are
 * distinct objects from the base table's, so object identity is unreliable
 * across the view boundary; the DB column name is stable). With a select
 * projection, the alias key is returned; without one, the JS property name off
 * the relation's column record. Shared by the pk keyField derivation below and
 * compile-window's order-signature field resolution.
 */
export function wireFieldFor(
  selectMap: SelectMap | undefined,
  columns: Record<string, PgColumn>,
  column: PgColumn,
): string | undefined {
  const map: Record<string, unknown> = selectMap ?? columns;
  for (const [key, value] of Object.entries(map)) {
    if (value === column || (is(value, Column) && value.name === column.name)) {
      return key;
    }
  }
  return undefined;
}

// The pk's wire field, or a loud throw — a keyed resource must project its
// identity column so the client keyOf can read it.
function keyFieldFor(
  selectMap: SelectMap | undefined,
  columns: Record<string, PgColumn>,
  pkColumn: PgColumn,
  label: string,
): string {
  const field = wireFieldFor(selectMap, columns, pkColumn);
  if (field !== undefined) return field;
  throw new Error(
    `queryResource: ${label} — the primary-key column "${pkColumn.name}" is not ` +
      `present in the ${selectMap ? "select projection" : "column set"}. A keyed ` +
      `resource must project its identity column so the client keyOf can read it.`,
  );
}

/**
 * Resolve the identity of a query source per the derivation rules:
 * - **Entity** → base table = `entity.name`; pk = the single primary of
 *   `getTableColumns(entity.table)`; default projection = `wireColumns`.
 * - **PgTable** → base table = `getTableConfig(table).name`; pk = its single
 *   primary; default projection = select-all.
 * - **PgView** → REQUIRES `identity.pk` AND `identity.table`. A view carries no
 *   pk metadata, and its identity base CANNOT be derived here: the
 *   `View({ view, identityTable })` contribution that would name it is collected
 *   at boot, while `queryResource(...)` resolves at module eval — always before
 *   collection (the owning barrel evaluates its `resources.ts` import first). A
 *   `relationIdentityBase` fallback was tried and is structurally dead code at
 *   this point in the lifecycle, so the base table is declared explicitly.
 *
 * `identity.pk` overrides the derived pk anywhere; a composite / missing pk (with
 * no override) throws.
 */
export function resolveIdentity(
  from: QuerySource,
  identity: { table?: string; pk: PgColumn } | undefined,
  select: SelectMap | undefined,
): ResolvedIdentity {
  // The `is()` checks run FIRST (entityKind-branded, unforgeable); the
  // structural entity check runs LAST — so a table whose COLUMNS happen to be
  // named `name`/`table`/`schema`/`wireColumns` can never be misdetected as an
  // entity (an Entity object itself is never `is()` a PgTable/PgView).
  if (is(from, PgView)) {
    const viewName = getViewConfig(from).name;
    const label = `view "${viewName}"`;
    if (!identity?.pk) {
      throw new Error(
        `queryResource: ${label} needs identity.pk — a PgView carries no ` +
          `primary-key metadata, so its identity column must be declared explicitly.`,
      );
    }
    const tableName = identity.table;
    if (!tableName) {
      throw new Error(
        `queryResource: ${label} needs identity.table — a view's identity base ` +
          `cannot be derived at module eval (the View({ view, identityTable }) ` +
          `contribution is only collected at boot, after this call). Pass the ` +
          `base table name explicitly, matching the view's derived-views ` +
          `identityTable declaration.`,
      );
    }
    const columns = getViewConfig(from).selectedFields as Record<string, PgColumn>;
    return {
      tableName,
      rel: from,
      pkColumn: identity.pk,
      keyField: keyFieldFor(select, columns, identity.pk, label),
      selectMap: select,
      columns,
    };
  }

  if (is(from, PgTable)) {
    const columns = getTableColumns(from);
    const label = `table "${getTableConfig(from).name}"`;
    const pkColumn = identity?.pk ?? singlePrimary(from, columns, label);
    return {
      tableName: identity?.table ?? getTableConfig(from).name,
      rel: from,
      pkColumn,
      keyField: keyFieldFor(select, columns, pkColumn, label),
      selectMap: select,
      columns,
    };
  }

  if (isEntitySource(from)) {
    const columns = getTableColumns(from.table);
    const label = `entity "${from.name}"`;
    const pkColumn = identity?.pk ?? singlePrimary(from.table, columns, label);
    const selectMap = select ?? from.wireColumns;
    return {
      tableName: identity?.table ?? from.name,
      rel: from.table,
      pkColumn,
      keyField: keyFieldFor(selectMap, columns, pkColumn, label),
      selectMap,
      columns,
    };
  }

  throw new Error(
    `queryResource: unsupported \`from\` source — expected a drizzle PgTable, ` +
      `PgView, or an infra/entities Entity.`,
  );
}
