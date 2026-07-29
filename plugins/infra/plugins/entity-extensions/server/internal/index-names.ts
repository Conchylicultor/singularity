// Pure name derivation + the two module-eval validations for
// `defineExtension`. Deliberately import-free: `define-extension.ts` pulls in
// `db` at module scope, so this logic lives here to stay unit-testable without
// a database.

// Postgres truncates any identifier past NAMEDATALEN-1 = 63 BYTES (not chars)
// and does so SILENTLY — two long index names can collapse onto the same
// truncated identifier and collide. Measure bytes, throw loudly.
const MAX_IDENTIFIER_BYTES = 63;

// An extension's table name is DERIVED (`<parent>_ext_<name>`), so the caller
// cannot write a drift-free index name by hand: a typo or a later parent rename
// yields a silently misleading name Postgres accepts without complaint. The
// caller supplies only a short table-local suffix and this binds the prefix,
// making a wrong name unrepresentable.
export function extensionIndexName(tableName: string, suffix: string): string {
  if (suffix.length === 0) {
    throw new Error(
      `defineExtension("${tableName}"): index suffix must be a non-empty string.`,
    );
  }
  if (!/^[a-z0-9_]+$/.test(suffix)) {
    throw new Error(
      `defineExtension("${tableName}"): invalid index suffix "${suffix}" — ` +
        `must match /^[a-z0-9_]+$/ (lowercase letters, digits, underscores).`,
    );
  }

  const name = `${tableName}_${suffix}_idx`;
  const bytes = Buffer.byteLength(name, "utf8");
  if (bytes > MAX_IDENTIFIER_BYTES) {
    throw new Error(
      `defineExtension("${tableName}"): index name "${name}" is ${bytes} bytes, ` +
        `over Postgres's ${MAX_IDENTIFIER_BYTES}-byte identifier limit — it would be ` +
        `silently truncated (and can collide). Shorten the suffix.`,
    );
  }
  return name;
}

// The three columns the primitive owns. A user column of the same name today
// produces an incoherent table: the runtime spread order lets `parentId` lose
// to the user column while `createdAt`/`updatedAt` win, so the declared shape
// and the actual DDL disagree. Refuse instead.
const RESERVED_COLUMN_KEYS = ["parentId", "createdAt", "updatedAt"] as const;

export function assertNoReservedColumns(
  tableName: string,
  columns: Record<string, unknown>,
): void {
  for (const key of RESERVED_COLUMN_KEYS) {
    if (key in columns) {
      throw new Error(
        `defineExtension("${tableName}"): column "${key}" is reserved — ` +
          `the primitive defines parentId, createdAt and updatedAt itself. ` +
          `Rename the column.`,
      );
    }
  }
}
