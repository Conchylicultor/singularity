import type {
  Filterable,
  FilterColumn,
  FilterDomainId,
} from "@plugins/network/plugins/live/plugins/filter/core";

/**
 * One projected column of a union row space.
 *
 * Two type systems meet on every column and they are NOT the same thing, so
 * both are named:
 *
 * - `domain` is the **filter-language domain** the column is filtered (and
 *   sorted) in (`text`, `number`, `boolean`, `instant`, `stringArray`), or
 *   `null` for a column that is only ever READ — a jsonb blob the row renders —
 *   which is then neither filterable nor sortable.
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
  /** Filter-language domain the column is filtered in; `null` = read-only (projected, never filtered or sorted). */
  domain: FilterDomainId | null;
  /** Postgres type an arm that does not own this column casts its NULL to. */
  sqlType: string;
  /** May this column be NULL even on an arm that owns it? Default `false`. */
  nullable?: boolean;
}

/** Projected column id → its spec. Iteration order IS the projection order. */
export type UnionColumnSpecs = Record<string, UnionColumnSpec>;

/** The discriminator column the compiler projects from each arm's `kind`. */
export interface UnionDiscriminator {
  fieldId: string;
  domain: FilterDomainId;
}

export const DEFAULT_UNION_DISCRIMINATOR: UnionDiscriminator = {
  fieldId: "kind",
  domain: "text",
};

/**
 * What a filter over the union may name: every base and arm column with a
 * domain, plus the discriminator, each in its domain. The ONE declaration both runtimes read — the
 * web `ServerDataSourceSpec.filterable` and the handler's strict decode.
 */
export function unionFilterable(
  base: UnionColumnSpecs,
  extra: UnionColumnSpecs,
  discriminator: UnionDiscriminator = DEFAULT_UNION_DISCRIMINATOR,
): Filterable {
  const out: Record<string, FilterColumn> = {
    [discriminator.fieldId]: { domain: discriminator.domain },
  };
  for (const [id, spec] of Object.entries({ ...base, ...extra })) {
    if (spec.domain !== null) out[id] = { domain: spec.domain };
  }
  return out;
}

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
