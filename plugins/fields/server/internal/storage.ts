import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { PgColumnBuilderBase } from "drizzle-orm/pg-core";
import type { FieldType } from "@plugins/fields/core";

/** Builds the BARE column for a field's value. Modifiers (notNull, default,
 *  primaryKey, json `$type<T>` branding) are applied by the entity builder
 *  (Stage C) from the field spec + entity meta — never baked in here. */
export type StorageColumnBuilder = (name: string) => PgColumnBuilderBase;

export interface FieldStorageContribution {
  type: FieldType;
  build: StorageColumnBuilder;
}

export const Fields = {
  /** Per-type DB column. Contribute `{ type, build }`; keyed by type token. */
  Storage: defineServerContribution<FieldStorageContribution>("fields.storage", {
    docLabel: (p) => p.type.id,
  }),
};

/** Resolve a field type's column builder by exact token (no `extends` fallback). */
export function resolveFieldStorage(
  typeId: string,
): StorageColumnBuilder | undefined {
  return Fields.Storage.getContributions().find((c) => c.type.id === typeId)
    ?.build;
}
