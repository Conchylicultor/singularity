import { customType } from "drizzle-orm/pg-core";

// fractional-indexing keys must be compared using binary (byte-order) collation,
// where uppercase letters ('A'-'Z', 65-90) sort before lowercase ('a'-'z', 97-122).
// PostgreSQL's default locale-aware collation violates this, causing rank order bugs.
// Use this type for all rank columns instead of plain text().
export const rankText = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'TEXT COLLATE "C"';
  },
});
