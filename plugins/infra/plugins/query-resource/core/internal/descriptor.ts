import { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import {
  keyedResourceDescriptor,
  type PointResourceDescriptor,
  type ResourceDescriptor,
  type ResourcePreload,
  type WindowParams,
  type WindowResourceDescriptor,
  type WindowSelector,
} from "@plugins/primitives/plugins/live-state/core";

// The web-safe half of a query-resource declaration. It is exactly a keyed
// `ResourceDescriptor` over `Row[]` (so the client keeps its `keyOf` and every
// `useResource` caller still gets `T[]`), plus one extra field — `queryPk` —
// recording WHICH row field the identity keys on. The server's `queryResource`
// asserts that `queryPk` equals the keyField it derives from the drizzle query,
// so a descriptor and its server query can never silently key on different
// columns (a boot-time throw on drift, not a runtime mismatch).
//
// NO drizzle imports live under `core/`: this file is bundled into the browser,
// so it may only reference the (web-safe) live-state descriptor + zod.
export type QueryResourceContract<
  Row,
  P extends Record<string, string> = Record<string, never>,
> = ResourceDescriptor<Row[], P> & {
  keyed: { keyOf: (row: unknown) => string };
  /** Always `[]` — the placeholder an optimistic overlay starts from. */
  initialData: Row[];
  /** The row field the client `keyOf` reads — matched against the server keyField. */
  queryPk: string;
};

// The bounded twins: a window (ordered `LIMIT`) or point (`ids`) membership
// descriptor, plus `queryPk` for the same drift assertion — what the server's
// `windowQueryResource` compiles. Only the TYPES live here, because that
// compiler consumes them. The one factory for each is internal to
// `network/live`: `liveCollection` mints its window and `:rows` sibling with
// them, and a collection is the one way to declare a bounded resource.
export type WindowQueryResourceContract<
  Row,
  P extends WindowParams = WindowParams,
  S extends WindowSelector = WindowSelector,
> = WindowResourceDescriptor<Row, P, S> & {
  /** The row field the client `keyOf` reads — matched against the server keyField. */
  queryPk: string;
};

export type PointQueryResourceContract<Row> = PointResourceDescriptor<Row> & {
  /** The row field the client `keyOf` reads — matched against the server keyField. */
  queryPk: string;
};

/**
 * The whole ordered set of a collection declared `all`
 * (`liveCollection(key, { all })`): ONE param-less keyed resource whose value
 * is every row, in `orderBy` order (pk as the tiebreaker). Unbounded by
 * declaration — `unbounded.reason` says why the set is small enough to hold
 * whole — so it has no window codec, no limit and no default tuple: boot
 * hydrates the `{}` tuple, and any param is a subscription this declaration
 * never minted (`validateParams` throws `ResourceContractError`). No
 * placeholder (`initialData`): not loaded yet is `pending`, never `[]`.
 *
 * Only the TYPE lives here, like the window and point contracts: the server
 * compiler (`compileAllCollection`) consumes it, and its one factory is
 * internal to `network/live`, minted by `liveCollection`.
 */
export type AllQueryResourceContract<Row> = ResourceDescriptor<
  Row[],
  Record<string, never>
> & {
  keyed: { keyOf: (row: unknown) => string };
  initialData?: never;
  all: {
    /**
     * The total order: row fields, each with its direction. The pk breaks
     * ties, so the order is total whatever the fields.
     */
    orderBy: readonly (readonly [keyof Row & string, "asc" | "desc"])[];
    /** Why the whole set is held: the `all` arm has no other bound. */
    unbounded: { reason: string };
  };
  /** The row field the client `keyOf` reads — matched against the server keyField. */
  queryPk: string;
};

/**
 * Declare a keyed live-state resource whose rows are a flat SQL query result.
 * A thin wrapper over `keyedResourceDescriptor`: the payload schema is
 * `z.array(rowSchema)`, the initial data is `[]`, and the client `keyOf` reads
 * `pkField` off each row. The returned contract additionally carries `queryPk`
 * (= `pkField`) so the server's `queryResource(descriptor, spec)` can assert the
 * descriptor and the derived query identity agree.
 *
 * `pkField` is the JS property the identity column is exposed under on the wire —
 * for an aliased projection (`select: { conversationId: table.parentId }`) that
 * is the alias (`"conversationId"`), not the DB column name.
 */
export function queryResourceDescriptor<
  Row,
  P extends Record<string, string> = Record<string, never>,
>(
  key: string,
  rowSchema: ZodParser<Row>,
  pkField: keyof Row & string,
  opts?: { preload?: ResourcePreload },
): QueryResourceContract<Row, P> {
  const descriptor = keyedResourceDescriptor<Row[], P>(
    key,
    z.array(rowSchema),
    [],
    (row) => String((row as Record<string, unknown>)[pkField]),
    opts,
  );
  return Object.assign(descriptor, { queryPk: pkField });
}
