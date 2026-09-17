import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

// A drizzle table object is preferred over a magic string so a rename is
// refactor-safe and a typo is a tsc error; we derive the pg name here. A string
// is accepted for the tables created imperatively with `CREATE TABLE IF NOT
// EXISTS` rather than by a migration (the live-state snapshot + changelog),
// which have no table object to pass — the same reason `derived-tables`'
// contribution takes a string.
//
// Shared by the fork and backup exclusion tokens (./fork-exclusion,
// ./backup-exclusion), which take the same `table` field.
export function tableLabel(table: PgTable | string): string {
  return typeof table === "string" ? table : getTableName(table);
}
