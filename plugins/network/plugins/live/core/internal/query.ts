import type { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import type { LiveOperands, LiveOpId, LiveScalar } from "./ops";

// The consumer-facing query language, typed against a collection's
// declaration: an undeclared column, a wrong operand type or a non-sortable
// `orderBy` column fails in tsc.

/**
 * The declared filterable columns: row field → zod schema of its operand. The
 * schema's output must be assignable to the row field's (non-null) type, so an
 * operand can only ever be compared with a value of its own type.
 */
export type LiveFilterable<Row> = {
  readonly [K in keyof Row & string]?: ZodParser<
    Extract<NonNullable<Row[K]>, LiveScalar>
  >;
};

type ExactlyOne<T> = {
  [K in keyof T]: { [P in K]: T[P] } & { [P in Exclude<keyof T, K>]?: never };
}[keyof T];

/** One column's filter: a plain value (meaning `eq`) or exactly one operator. */
export type LiveColumnFilter<V> = V | ExactlyOne<LiveOperands<V>>;

/** AND across declared columns. No OR, no operator whose answer depends on the current time. */
export type LiveWhere<F> = {
  [K in keyof F]?: F[K] extends ZodParser<LiveScalar>
    ? LiveColumnFilter<z.output<F[K]>>
    : never;
};

export type LiveSortDirection = "asc" | "desc";

/** Sort keys, most significant first. The server appends the id as tiebreaker. */
export type LiveOrderBy<S extends string> = readonly (readonly [
  S,
  LiveSortDirection,
])[];

/** A window query. Every part defaults to the declaration's `default`. */
export interface LiveQuery<F, S extends string> {
  where?: LiveWhere<F>;
  orderBy?: LiveOrderBy<S>;
  limit?: number;
  /** A grouping is its own query shape — {@link LiveGroupQuery}. */
  groupBy?: never;
}

/**
 * A grouping query: the values the filterable column `G` takes across the
 * collection's rows matching `where`, one `{ value, count }` per value. The
 * order is fixed — count descending, then value (code-point order) — so there
 * is no `orderBy`. `limit` bounds how many groups come back (default
 * {@link LIVE_GROUP_DEFAULT_LIMIT}, max `LIVE_LIST_MAX`: a picked set of groups
 * must still fit one `in` filter).
 *
 * `where` applies as given: to keep every chip visible while one is picked,
 * leave the grouped column out of it.
 */
export interface LiveGroupQuery<
  F,
  G extends keyof F & string = keyof F & string,
> {
  groupBy: G;
  where?: LiveWhere<F>;
  limit?: number;
  orderBy?: never;
}

/** One group: a value of the grouped column (NULL is its own group) and how many rows carry it. */
export interface LiveGroup<V> {
  value: V | null;
  count: number;
}

/** The value type of filterable column `G`. */
export type LiveGroupValue<F, G extends keyof F> =
  F[G] extends ZodParser<LiveScalar> ? z.output<F[G]> : never;

/** Default number of groups a grouping query returns. */
export const LIVE_GROUP_DEFAULT_LIMIT = 50;

/**
 * The window resource's wire params: `limit` always, `where` / `order` as
 * canonical JSON present only when they differ from the default. Additive
 * string keys, so the default window stays byte-identical `{ limit: "100" }`.
 */
export type LiveWindowParams = {
  limit: string;
  where?: string;
  order?: string;
};

/**
 * The groups resource's wire params: `groupBy` and `limit` always, `where` as
 * canonical JSON (the window codec's) present only when non-empty.
 */
export type LiveGroupParams = {
  groupBy: string;
  limit: string;
  where?: string;
};

/** One validated, canonical filter clause (plain values already folded into `eq`). */
export type LiveClause<C extends string = string> = {
  [K in LiveOpId]: { column: C; op: K; operand: LiveOperands<LiveScalar>[K] };
}[LiveOpId];

/** A decoded query with every default filled in — what a server compiler consumes. */
export interface LiveDecodedQuery<C extends string, S extends string> {
  limit: number;
  /** Sorted by column; empty when unfiltered. */
  where: readonly LiveClause<C>[];
  orderBy: LiveOrderBy<S>;
}

/** A decoded grouping query with every default filled in. */
export interface LiveDecodedGroupQuery<C extends string> {
  groupBy: C;
  limit: number;
  /** Sorted by column; empty when unfiltered. */
  where: readonly LiveClause<C>[];
}
