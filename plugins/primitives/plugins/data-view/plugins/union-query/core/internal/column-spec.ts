/**
 * One projected column of a union row space.
 *
 * Two type systems meet on every column and they are NOT the same thing, so
 * both are named:
 *
 * - `type` is the **field-type id** (`"text"`, `"enum"`, `"date"`, `"number"`,
 *   `"bool"`, …). It is what resolves a filter operator to a SQL builder, and it
 *   is the id the web `FieldDef.type` carries.
 * - `sqlType` is the **Postgres type**. It exists because a `UNION ALL` type-checks
 *   column by column: an arm that does not own a column projects `NULL`, and a
 *   bare `NULL` is `unknown` to Postgres. `NULL::text` is not.
 *
 * `nullable` drives the null-aware keyset seek. It is a floor, not the final
 * word — the compiler treats a column as nullable whenever *any* surviving arm
 * projects NULL into it, because the seek terms have to be symmetric across the
 * whole union or a page boundary drops rows.
 */
export interface UnionColumnSpec {
  /** Field-type id, for operator resolution. */
  type: string;
  /** Postgres type an arm that does not own this column casts its NULL to. */
  sqlType: string;
  /** May this column be NULL even on an arm that owns it? Default `false`. */
  nullable?: boolean;
}

/** Projected column id → its spec. Iteration order IS the projection order. */
export type UnionColumnSpecs = Record<string, UnionColumnSpec>;

/**
 * A cursor minted under a different sort was replayed against this request's
 * ordering. Replaying it would seek against the wrong key tuple and silently
 * duplicate or skip rows, so it is refused rather than tolerated. Consumers
 * translate this into a 400 — it is a stale client, not a server fault.
 */
export class UnionCursorMismatchError extends Error {
  constructor(
    readonly expected: string,
    readonly received: string,
  ) {
    super(
      `cursor sort signature mismatch: cursor was minted under "${received}", request sorts by "${expected}"`,
    );
    this.name = "UnionCursorMismatchError";
  }
}
