import {
  type BuildExtraConfigColumns,
  eq,
  getTableName,
  type InferInsertModel,
  type InferSelectModel,
} from "drizzle-orm";
import {
  type AnyIndexBuilder,
  type AnyPgColumn,
  index,
  type PgColumnBuilderBase,
  type PgTable,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { db } from "@plugins/database/server";
import { assertNoReservedColumns, extensionIndexName } from "./index-names";

type ParentTable = PgTable & { id: AnyPgColumn };
type UserColumns = Record<string, PgColumnBuilderBase>;
type ExtensionTable = PgTable & { parentId: AnyPgColumn };

// The three columns the primitive owns, in one non-generic place so the
// callback's `ExtensionColumns<C>` type is DERIVED from the runtime columns and
// cannot drift from them.
function baseColumns(parentTable: ParentTable) {
  return {
    parentId: text("parent_id")
      .primaryKey()
      .references((): AnyPgColumn => parentTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  };
}

type BaseColumns = ReturnType<typeof baseColumns>;
type ExtensionColumns<C extends UserColumns> = BaseColumns & C;

// Index builders pre-bound to the DERIVED table name. The caller supplies only
// a short table-local suffix (`"block_created"`) and gets back drizzle's own
// builder, so the full expressive surface — `.on()`, `.using()`, `.where()`,
// `.desc()` — stays available. See `index-names.ts` for why the prefix is bound
// rather than authored.
export interface ExtensionIndexBuilders {
  index(suffix: string): ReturnType<typeof index>;
  uniqueIndex(suffix: string): ReturnType<typeof uniqueIndex>;
}

// Optional 4th argument to `defineExtension`, mirroring `defineEntity`'s `meta`
// (room to grow beyond indexes).
export interface ExtensionMeta<C extends UserColumns> {
  // Passthrough to pgTable's 3rd-arg callback; `t` is keyed by JS property
  // name and covers the base columns as well as the user's.
  indexes?: (
    t: BuildExtraConfigColumns<string, ExtensionColumns<C>, "pg">,
    b: ExtensionIndexBuilders,
  ) => AnyIndexBuilder[];
}

// Typed handle returned by `EntityExtensions.defineExtension(...)`. Wraps a
// 1:1 side-table keyed by the parent's id. The pgTable is exposed as
// `.table` so the *defining* plugin can compose richer drizzle queries
// (live-state resource loaders, complex SQL); cross-plugin imports of the
// table are blocked by the boundary checker because the table never leaves
// `internal/` — only the handle is barrel-exported.
export interface EntityExtension<T extends ExtensionTable> {
  readonly table: T;
  get(parentId: string): Promise<InferSelectModel<T> | undefined>;
  upsert<
    U extends Partial<
      Omit<InferInsertModel<T>, "parentId" | "createdAt" | "updatedAt">
    >,
  >(parentId: string, patch: U): Promise<InferSelectModel<T>>;
  delete(parentId: string): Promise<void>;
}

// Bind the handle methods to a concrete table type. T is generic at this
// call so consumers see strict per-column types in `upsert`'s patch and
// `get`'s return — same shape the original `getExtension`/`upsertExtension`
// helpers had at their call sites.
function createHandle<T extends ExtensionTable>(table: T): EntityExtension<T> {
  // Loose alias for drizzle's overloads, which choke on the precise generic.
  const t = table as unknown as ExtensionTable;
  return Object.freeze({
    table,
    async get(parentId: string): Promise<InferSelectModel<T> | undefined> {
      const rows = await db
        .select()
        .from(t)
        .where(eq(t.parentId, parentId))
        .limit(1);
      return rows[0] as InferSelectModel<T> | undefined;
    },
    async upsert<
      U extends Partial<
        Omit<InferInsertModel<T>, "parentId" | "createdAt" | "updatedAt">
      >,
    >(parentId: string, patch: U): Promise<InferSelectModel<T>> {
      const now = new Date();
      const rows = await db
        .insert(t)
        .values({ parentId, ...patch, updatedAt: now })
        .onConflictDoUpdate({
          target: t.parentId,
          set: { ...patch, updatedAt: now },
        })
        .returning();
      return rows[0] as InferSelectModel<T>;
    },
    async delete(parentId: string): Promise<void> {
      await db.delete(t).where(eq(t.parentId, parentId));
    },
  });
}

// Define a `<parent>_ext_<name>` 1:1 side-table and return a handle whose
// methods close over it. The parent plugin doesn't know the extension
// exists; the consumer owns the table, its live-state resource, its HTTP
// route, and its UI. Drizzle-kit discovers the underlying pgTable when the
// consumer re-exports `<handle>.table` from the same `tables*.ts` file —
// see the entity-extensions CLAUDE.md for the convention.
//
// `meta.indexes` declares indexes on the extension's own columns — needed when
// the plugin composes queries off `.table` keyed by something other than
// `parentId` (the PK's implicit btree covers that read and nothing else).
export function defineExtension<P extends ParentTable, C extends UserColumns>(
  parentTable: P,
  name: string,
  columns: C,
  meta: ExtensionMeta<C> = {},
) {
  const tableName = `${getTableName(parentTable)}_ext_${name}`;
  assertNoReservedColumns(tableName, columns);

  const builders: ExtensionIndexBuilders = {
    index: (suffix) => index(extensionIndexName(tableName, suffix)),
    uniqueIndex: (suffix) => uniqueIndex(extensionIndexName(tableName, suffix)),
  };

  const { parentId, createdAt, updatedAt } = baseColumns(parentTable);
  const table = pgTable(
    tableName,
    // Key order is load-bearing: drizzle-kit diffs positionally, so moving
    // createdAt/updatedAt ahead of the user columns would emit a spurious
    // column-reorder migration for all 22 existing extensions.
    { parentId, ...columns, createdAt, updatedAt },
    // One `as any` at the runtime/type boundary, same as `define-entity.ts`:
    // the precise `t` type rides in `ExtensionMeta`'s own signature.
    (t: any) => meta.indexes?.(t, builders) ?? [],
  );
  return createHandle(table);
}
