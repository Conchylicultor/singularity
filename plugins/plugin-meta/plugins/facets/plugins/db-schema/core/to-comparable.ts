import type { DbSchemaFacetData } from "./types";

/** Diff projection: one SQL table name per `pgTable` declaration.
 *  Mirrors the legacy tableStrings() (compute-plugin-diff.ts) so the diff
 *  output is identical. Entity-extension relationships (entityExtensions /
 *  extendedBy) are derived cross-refs, not owned schema, and were never part
 *  of the legacy diff — so they stay out of the comparable set. */
export function dbSchemaToComparable(data: DbSchemaFacetData): string[] {
  return data.tables.map((t) => t.name);
}
