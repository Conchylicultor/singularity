import type { PgColumnBuilderBase } from "drizzle-orm/pg-core";
import type { FieldsRecord } from "@plugins/fields/core";
import { resolveFieldStorage } from "./storage";

// The server twin of `fieldsToZodObject` (fields/core): both read the same
// FieldsRecord. Where `fieldsToZodObject` derives the wire schema,
// `fieldsToColumns` derives the bare DB columns — one builder per field, keyed
// by exact type token. Modifiers (notNull, default, primaryKey, json branding)
// are applied by the entity builder (Stage C), never here.
//
// Throws loudly (naming the field key + type id) when a field's type has no
// `fields.storage` contribution — a field with no column mapping is a defect,
// never silently skipped.
export function fieldsToColumns(
  record: FieldsRecord,
): Record<string, PgColumnBuilderBase> {
  const columns: Record<string, PgColumnBuilderBase> = {};
  for (const [key, field] of Object.entries(record)) {
    const build = resolveFieldStorage(field.type.id);
    if (!build) {
      throw new Error(
        `fieldsToColumns: field "${key}" has type "${field.type.id}" with no ` +
          `fields.storage contribution — no DB column mapping. Contribute ` +
          `Fields.Storage({ type, build }) for this type.`,
      );
    }
    columns[key] = build(key);
  }
  return columns;
}
