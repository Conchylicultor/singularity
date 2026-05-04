import {
  eq,
  getTableName,
  type InferInsertModel,
  type InferSelectModel,
} from "drizzle-orm";
import {
  type AnyPgColumn,
  type PgColumnBuilderBase,
  type PgTable,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { db } from "@server/db/client";

type ParentTable = PgTable & { id: AnyPgColumn };
type UserColumns = Record<string, PgColumnBuilderBase>;
type ExtensionTable = PgTable & { parentId: AnyPgColumn };

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
export function defineExtension<P extends ParentTable, C extends UserColumns>(
  parentTable: P,
  name: string,
  columns: C,
) {
  const tableName = `${getTableName(parentTable)}_ext_${name}`;
  const table = pgTable(tableName, {
    parentId: text("parent_id")
      .primaryKey()
      .references((): AnyPgColumn => parentTable.id, { onDelete: "cascade" }),
    ...columns,
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  });
  return createHandle(table);
}
