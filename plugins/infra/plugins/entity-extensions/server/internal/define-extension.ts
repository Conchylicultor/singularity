import { eq, getTableName, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
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

// 1:1 side-table keyed by the parent's id. The parent plugin doesn't know the
// extension exists; the child plugin owns the table, its live-state resource,
// its HTTP route, and its UI. Returns the pgTable directly so drizzle-kit
// discovers it via the consumer's `export const ... = defineExtension(...)`
// — same shape as `Attachments.defineLink`. The consumer's file must match
// drizzle-kit's `tables.ts` / `tables-*.ts` glob in `server/drizzle.config.ts`.
export function defineExtension<P extends ParentTable, C extends UserColumns>(
  parentTable: P,
  name: string,
  columns: C,
) {
  const tableName = `${getTableName(parentTable)}_ext_${name}`;
  return pgTable(tableName, {
    parentId: text("parent_id")
      .primaryKey()
      .references((): AnyPgColumn => parentTable.id, { onDelete: "cascade" }),
    ...columns,
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  });
}

type ExtensionTable = PgTable & { parentId: AnyPgColumn };

export async function getExtension<T extends ExtensionTable>(
  table: T,
  parentId: string,
): Promise<InferSelectModel<T> | undefined> {
  const t = table as unknown as ExtensionTable;
  const rows = await db.select().from(t).where(eq(t.parentId, parentId)).limit(1);
  return rows[0] as InferSelectModel<T> | undefined;
}

export async function upsertExtension<T extends ExtensionTable>(
  table: T,
  parentId: string,
  patch: Partial<Omit<InferInsertModel<T>, "parentId" | "createdAt" | "updatedAt">>,
): Promise<InferSelectModel<T>> {
  const t = table as unknown as ExtensionTable;
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
}
