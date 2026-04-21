import { customType } from "drizzle-orm/pg-core";

// fractional-indexing keys must be compared using binary (byte-order) collation,
// where uppercase letters ('A'-'Z', 65-90) sort before lowercase ('a'-'z', 97-122).
// PostgreSQL's default locale-aware collation violates this, causing rank order bugs.
// Use this type for all rank columns instead of plain text().
//
// Backed by the `rank_text` PostgreSQL domain (TEXT COLLATE "C"), created in migration
// use_rank_text_domain. Using a named domain rather than returning 'TEXT COLLATE "C"'
// directly avoids a drizzle-kit bug where multi-word dataType() strings get
// double-quoted in CREATE TABLE DDL, producing invalid SQL.
export const rankText = customType<{ data: string; driverData: string }>({
  dataType() {
    return "rank_text";
  },
});
