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
}

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
