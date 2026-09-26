import { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import {
  resourceDescriptor,
  type ResourceDescriptor,
  type ResourcePreload,
} from "@plugins/primitives/plugins/live-state/core";
import {
  pointQueryResourceDescriptor,
  windowQueryResourceDescriptor,
  type PointQueryResourceContract,
  type WindowQueryResourceContract,
} from "@plugins/infra/plugins/query-resource/core";
import {
  LIST_MAX,
  type Filterable,
  type FilterScalar,
} from "@plugins/network/plugins/live/plugins/filter/core";
import {
  LIVE_GROUP_DEFAULT_LIMIT,
  type LiveDecodedGroupQuery,
  type LiveDecodedQuery,
  type LiveFilterable,
  type LiveGroup,
  type LiveGroupParams,
  type LiveGroupQuery,
  type LiveOrderBy,
  type LiveReservedColumn,
  type LiveQuery,
  type LiveWindowParams,
} from "./query";
import { createLiveQueryCodec } from "./query-codec";

/** The window descriptor's codec: the query ⇄ wire-params pair, plus the bounds it enforces. */
export interface LiveWindowCodec<F, S extends string> {
  /** The window every consumer gets when it names none. */
  defaultLimit: number;
  /** No encoded or decoded window exceeds this (encode/decode throw, never clamp). */
  maxLimit: number;
  defaultOrderBy: LiveOrderBy<S>;
  /** Canonical encode. Throws on an undeclared column, an op its domain does not take, a bad operand, or a limit above `maxLimit`. */
  encode: (query?: LiveQuery<F, S>) => LiveWindowParams;
  /** STRICT decode with every default filled in. Throws unless `params` is exactly a canonical encoding. */
  decode: (params: Record<string, string>) => LiveDecodedQuery<S>;
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

/** The groups descriptor's codec: the grouping query ⇄ wire-params pair, plus its bounds. */
export interface LiveGroupCodec<F> {
  /** Groups a grouping query returns when it names no `limit`. */
  defaultLimit: number;
  /** No grouping query returns more groups than this (the filter language's `LIST_MAX`). */
  maxLimit: number;
  /** Canonical encode. Throws on a non-groupable `groupBy`, a bad `where`, a limit above max, or an `orderBy`. */
  encode: (query: LiveGroupQuery<F>) => LiveGroupParams;
  /** STRICT decode. Throws unless `params` is exactly a canonical encoding. */
  decode: (
    params: Record<string, string>,
  ) => LiveDecodedGroupQuery<keyof F & string>;
}

/**
 * `${key}:groups` — a plain (non-keyed) push value per grouping query. Every
 * groupable column's values share the wire schema (any scalar or NULL); the
 * server validates each value against the row schema's field.
 */
export type LiveGroupsDescriptor<F> = ResourceDescriptor<
  LiveGroup<FilterScalar>[],
  LiveGroupParams
> & { keyed?: never; groups: LiveGroupCodec<F> };

/**
 * A collection's row schema: a zod OBJECT, so its keys can be read — the server
 * projects exactly these keys, which is what keeps a server-only column (a
 * dedup key, a secret) off the wire.
 */
export type LiveRowSchema<Row> = ZodParser<Row> & {
  readonly shape: { readonly [K in keyof NoInfer<Row>]-?: unknown };
};

/**
 * When a declaration is loaded ahead of any mount — one type for `liveValue`
 * and `liveCollection`:
 *
 * - `"none"` (the default): on first mount.
 * - `"boot"`: hydrated by the boot snapshot before first paint (at the
 *   declaration's default tuple), which pins the owning plugin to the eager
 *   tier; a DB-backed one is also L2-persisted for instant cold boot.
 * - `"boot-and-keep"`: `"boot"`, and the client keeps the cached value resident
 *   for the tab's lifetime, so a surface that mounts late never re-enters a
 *   loading window boot already closed.
 *
 * A collection preloads its default WINDOW only — the server cannot know a
 * tab's id sets or grouping queries at boot.
 */
export type LivePreload = "none" | ResourcePreload;

export interface LiveCollection<Row, F, S extends string> {
  key: string;
  /** `key` — the ordered, filtered, bounded window. */
  window: LiveWindowDescriptor<Row, F, S>;
  /** `${key}:rows` — explicit id sets; answers "does this row exist", ignoring any filter. */
  rows: PointQueryResourceContract<Row>;
  /** `${key}:groups` — the values a filterable column takes, with counts. */
  groups: LiveGroupsDescriptor<F>;
  id: keyof Row & string;
  /** The row schema — its keys are exactly the fields the server projects. */
  row: LiveRowSchema<Row>;
  /** The row schema's keys — exactly the fields the server projects. */
  rowKeys: readonly (keyof Row & string)[];
  /** The filterable columns' domains — the filter language's declaration. */
  filterable: F;
  sortable: readonly S[];
}

export interface LiveCollectionSpec<Row, F, S extends string> {
  row: LiveRowSchema<Row>;
  /** The row field that identifies a row (the point sibling's id set, the window's tiebreaker). */
  id: keyof Row & string;
  /** Row field → domain constructor (`liveText(Schema)`, `liveBoolean()` …). */
  filterable: F;
  sortable: readonly S[];
  default: { orderBy: LiveOrderBy<S>; limit: number };
  /** Hard cap on any window's limit. There is no unbounded spelling. */
  maxLimit: number;
  /** Default `"none"`. A preload reaches the DEFAULT WINDOW only (see {@link LivePreload}). */
  preload?: LivePreload;
}

/**
 * Declare a live collection: one declaration minting three resources — `key`
 * (window membership: filtered, ordered, limited), `${key}:rows` (point
 * membership: explicit ids) and `${key}:groups` (a filterable column's values
 * with counts). Bounded by construction: a default limit and a `maxLimit` are
 * required, and a grouping query is capped at `LIST_MAX` groups.
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
    filterable: {
      [
        K in Exclude<keyof F, keyof Row> | Extract<keyof F, LiveReservedColumn>
      ]: never;
    };
  },
): LiveCollection<Row, F, S> {
  const codec = createLiveQueryCodec<keyof F & string, S>({
    key,
    // `LiveFilterable`'s keys are optional; a declared one always holds a column.
    filterable: spec.filterable as unknown as Filterable,
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
  // Only the window is ever preloaded: `:rows` and `:groups` have no default
  // tuple the server could load before a tab names one. The flag is forwarded
  // as is — `"none"` is the absence of the descriptor field.
  const preloadOpts: { preload?: ResourcePreload } =
    spec.preload === undefined || spec.preload === "none"
      ? {}
      : { preload: spec.preload };
  const window = Object.assign(
    windowQueryResourceDescriptor(key, spec.row, spec.id, {
      defaultLimit: spec.default.limit,
      ...preloadOpts,
    }),
    { window: windowCodec, defaultParams: windowCodec.encode() },
  );
  const rows = pointQueryResourceDescriptor(`${key}:rows`, spec.row, spec.id);
  const groupCodec: LiveGroupCodec<F> = {
    defaultLimit: LIVE_GROUP_DEFAULT_LIMIT,
    maxLimit: LIST_MAX,
    encode: codec.encodeGroups,
    decode: codec.decodeGroups,
  };
  const groups = Object.assign(
    resourceDescriptor<LiveGroup<FilterScalar>[], LiveGroupParams>(
      `${key}:groups`,
      z.array(
        z.object({
          value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
          count: z.number().int().nonnegative(),
        }),
      ),
      [],
    ),
    { groups: groupCodec },
  );
  return {
    key,
    window,
    rows,
    groups,
    id: spec.id,
    row: spec.row,
    rowKeys: Object.keys(spec.row.shape) as (keyof Row & string)[],
    filterable: spec.filterable,
    sortable: spec.sortable,
  };
}
