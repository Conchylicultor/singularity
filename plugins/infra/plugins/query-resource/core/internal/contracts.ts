import type {
  PointResourceDescriptor,
  ResourceDescriptor,
  WindowParams,
  WindowResourceDescriptor,
  WindowSelector,
} from "@plugins/primitives/plugins/live-state/core";

// The web-safe half of a query-resource declaration: the contract a server
// compiler consumes. Each is a live-state descriptor plus one extra field —
// `queryPk` — recording WHICH row field the identity keys on. The server
// compilers assert that `queryPk` equals the keyField they derive from the
// drizzle query, so a descriptor and its server query can never silently key
// on different columns (a module-eval throw on drift, not a runtime mismatch).
//
// Only the TYPES live here. Each one's factory is internal to `network/live`:
// `liveCollection` mints a collection's window, `:rows` point and `all`
// descriptors with them, and a collection is the one way to declare one.
//
// NO drizzle imports live under `core/`: this file is bundled into the browser,
// so it may only reference the (web-safe) live-state descriptor types.

// The bounded twins: a window (ordered `LIMIT`) or point (`ids`) membership
// descriptor — what the server's `windowQueryResource` compiles.
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
 * never minted (`validateParams` throws `ResourceContractError`). Not loaded
 * yet is `pending`, never `[]`.
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
