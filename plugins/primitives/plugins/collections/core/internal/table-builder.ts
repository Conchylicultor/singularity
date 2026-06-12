import { pgTable, text, timestamp, type PgColumnBuilderBase } from "drizzle-orm/pg-core";
import { rankText } from "@plugins/primitives/plugins/rank/core";
import type { FieldsRecord } from "./field-types";
import type { CollectionOptions, CollectionTable } from "./types";

const STANDARD_COLUMN_KEYS = new Set(["id", "rank", "createdAt", "updatedAt"]);

export function buildTable<F extends FieldsRecord>(
  opts: CollectionOptions<F>,
): CollectionTable<F> {
  if (opts.primaryKey) {
    throw new Error(
      "primaryKey option is not yet supported — deferred to a future phase",
    );
  }

  const fieldCols: Record<string, PgColumnBuilderBase> = {};
  for (const [jsName, field] of Object.entries(opts.fields)) {
    const contributed = field._columns(jsName);
    for (const colKey of Object.keys(contributed)) {
      if (STANDARD_COLUMN_KEYS.has(colKey)) {
        throw new Error(
          `Field "${jsName}" contributes column key "${colKey}" that conflicts with a standard column`,
        );
      }
      fieldCols[colKey] = contributed[colKey]!;
    }
  }

  const allCols: Record<string, PgColumnBuilderBase> = {
    id: text("id").primaryKey(),
    ...fieldCols,
    ...(opts.ranked !== false
      ? { rank: rankText("rank").notNull() }
      : {}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  };

  return pgTable(opts.tableName, allCols) as unknown as CollectionTable<F>;
}
