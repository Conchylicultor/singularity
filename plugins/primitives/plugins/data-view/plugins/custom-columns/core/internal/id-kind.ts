import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * A user-defined custom column's id (a definition row, and the `column_id` of
 * its per-row values), declared once (`plugins/ids`). `uuid`-shaped: minted
 * client-side. Its length is load-bearing — a column is joined under the SQL
 * alias `custom__cc_2d_<uuid, hyphens spelled _2d_>`, exactly 62 bytes, one
 * under Postgres's 63-byte identifier limit (`familyMemberAlias`,
 * query-resource), so a longer prefix or body would fall back to a hashed
 * alias. Rows minted as `cc-<uuid>` stay recognised; the normalizer's
 * `cc-<n>` fallback is not an id of the kind.
 */
export const customColumnIdKind = defineIdKind({
  prefix: "cc",
  label: "Custom column",
  shape: "uuid",
});

export type CustomColumnId = IdOf<typeof customColumnIdKind>;
