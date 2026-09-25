import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import {
  pointQueryResourceDescriptor,
  windowQueryResourceDescriptor,
  type PointQueryResourceContract,
  type WindowQueryResourceContract,
} from "@plugins/infra/plugins/query-resource/core";
import type { LiveScalar } from "./ops";
import type {
  LiveDecodedQuery,
  LiveFilterable,
  LiveOrderBy,
  LiveQuery,
  LiveWindowParams,
} from "./query";
import { createLiveQueryCodec } from "./query-codec";

/** The window descriptor's codec: the query ⇄ wire-params pair, plus the bounds it enforces. */
export interface LiveWindowCodec<F, S extends string> {
  /** The window every consumer gets when it names none. */
  defaultLimit: number;
  /** No encoded or decoded window exceeds this (encode/decode throw, never clamp). */
  maxLimit: number;
  defaultOrderBy: LiveOrderBy<S>;
  /** Canonical encode. Throws on an undeclared column, bad operand, or limit above `maxLimit`. */
  encode: (query?: LiveQuery<F, S>) => LiveWindowParams;
  /** STRICT decode with every default filled in. Throws unless `params` is exactly a canonical encoding. */
  decode: (
    params: Record<string, string>,
  ) => LiveDecodedQuery<keyof F & string, S>;
}

/**
 * The window half of a collection: a `WindowQueryResourceContract` over the
 * query codec's params and selector, whose `window` codec is the richer query
 * codec (decode yields `{ limit, where, orderBy }`, not just `limit`) — so the
 * existing `windowQueryResource` compiler and window hooks accept it unchanged.
 */
export type LiveWindowDescriptor<Row, F, S extends string> = Omit<
  WindowQueryResourceContract<Row, LiveWindowParams, LiveQuery<F, S>>,
  // Replaced, not intersected: an intersected `decode` would be an overload
  // whose limit-only arm wins every call.
  "window"
> & {
  window: LiveWindowCodec<F, S>;
};

export interface LiveCollection<Row, F, S extends string> {
  key: string;
  /** `key` — the ordered, filtered, bounded window. */
  window: LiveWindowDescriptor<Row, F, S>;
  /** `${key}:rows` — explicit id sets; answers "does this row exist", ignoring any filter. */
  rows: PointQueryResourceContract<Row>;
  id: keyof Row & string;
  filterable: F;
  sortable: readonly S[];
}

export interface LiveCollectionSpec<Row, F, S extends string> {
  row: ZodParser<Row>;
  /** The row field that identifies a row (the point sibling's id set, the window's tiebreaker). */
  id: keyof Row & string;
  filterable: F;
  sortable: readonly S[];
  default: { orderBy: LiveOrderBy<S>; limit: number };
  /** Hard cap on any window's limit. There is no unbounded spelling. */
  maxLimit: number;
}

/**
 * Declare a live collection: one declaration minting two resources — `key`
 * (window membership: filtered, ordered, limited) and `${key}:rows` (point
 * membership: explicit ids). Bounded by construction: a default limit and a
 * `maxLimit` are required.
 *
 * `key` stays a positional string literal: the build scanners read it statically.
 */
export function liveCollection<
  Row,
  const F extends LiveFilterable<Row>,
  const S extends keyof Row & string = never,
>(
  key: string,
  spec: LiveCollectionSpec<Row, F, S> & {
    filterable: { [K in Exclude<keyof F, keyof Row>]: never };
  },
): LiveCollection<Row, F, S> {
  const codec = createLiveQueryCodec<keyof F & string, S>({
    key,
    filterable: spec.filterable as Readonly<
      Record<string, ZodParser<LiveScalar> | undefined>
    >,
    sortable: spec.sortable,
    defaultOrderBy: spec.default.orderBy,
    defaultLimit: spec.default.limit,
    maxLimit: spec.maxLimit,
  });
  const windowCodec: LiveWindowCodec<F, S> = {
    defaultLimit: spec.default.limit,
    maxLimit: spec.maxLimit,
    defaultOrderBy: spec.default.orderBy,
    encode: codec.encode,
    decode: codec.decode,
  };
  // Built on the existing factory (descriptor registration, keyed `keyOf`,
  // `queryPk`), then its limit-only codec is replaced by the query codec. The
  // default window encodes to the same `{ limit }` bytes either way.
  const window = Object.assign(
    windowQueryResourceDescriptor(key, spec.row, spec.id, {
      defaultLimit: spec.default.limit,
    }),
    { window: windowCodec, defaultParams: windowCodec.encode() },
  );
  const rows = pointQueryResourceDescriptor(`${key}:rows`, spec.row, spec.id);
  return {
    key,
    window,
    rows,
    id: spec.id,
    filterable: spec.filterable,
    sortable: spec.sortable,
  };
}
