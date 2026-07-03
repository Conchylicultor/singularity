import type { SQL } from "drizzle-orm";
import type { PgColumn, PgTable, PgView } from "drizzle-orm/pg-core";
import type { ZodType } from "zod";
import type {
  DependsOnEntry,
  Resource,
  ResourceParams,
} from "@plugins/framework/plugins/resource-runtime/core";

// A structural view of an `infra/entities` Entity — exactly the subset the
// compiler reads (`name`, `table`, `wireColumns`, `schema`). A concrete
// `Entity<F, D, S>` satisfies this by construction, so the compiler detects and
// consumes an entity WITHOUT importing the full generic `Entity` type — whose
// generic-erased form (`Entity<FieldsRecord>`) fights assignability against a
// concrete entity. Detection is likewise structural (see `identity.ts`).
export interface EntitySource {
  readonly name: string;
  readonly table: PgTable;
  readonly wireColumns: Record<string, PgColumn>;
  readonly schema: ZodType<unknown>;
}

/** The three relation kinds a query-resource can read from. */
export type QuerySource = PgTable | PgView | EntitySource;

/** A drizzle select projection: JS key → column (or aliased SQL expression). */
export type SelectMap = Record<string, PgColumn | SQL.Aliased>;

// The minimal chainable query surface the compiler drives: `select → from →
// optional where/orderBy/limit → await rows`. Kept deliberately small so
// neither the production default (the real drizzle `db`, cast once at the
// default-db boundary in `compile.ts`) nor the unit-test fake needs drizzle's
// full generics. `QueryStep` is a `PromiseLike<unknown[]>`, so a loader can
// `return` a built step and let the runtime `await` it (the same pattern the
// hand-written tasks-core loaders use).
export interface QueryStep extends PromiseLike<unknown[]> {
  where(predicate: SQL): QueryStep;
  orderBy(...order: SQL[]): QueryStep;
  limit(count: number): QueryStep;
}
export interface QueryFrom {
  from(source: PgTable | PgView): QueryStep;
}
export interface QueryDb {
  select(fields?: SelectMap): QueryFrom;
  selectDistinct(fields: SelectMap): QueryFrom;
}

/**
 * One join step of a cascade edge: read `to` (distinct) from `via` for every row
 * whose `from` column is in the incoming id set. The distinct `to` values become
 * the next hop's incoming set (or, for the final hop, this resource's changed
 * ids). A single-table FK translation (the old `upstreamTable`/`fk`/`upstreamPk`
 * shape) is just a one-element `hops` chain; a multi-table mapping (e.g.
 * conversation → task → launch) chains one hop per join.
 */
export interface Hop {
  via: PgTable | PgView;
  from: PgColumn; // matched against the incoming id set (upstream side)
  to: PgColumn; // its distinct values become the next hop's id set / the result
}

/**
 * A compiled cross-resource cascade edge (produced by `rel()`). It is folded
 * into a `dependsOn` entry (its `affectedMap` chains `hops` — one
 * `selectDistinct` per hop — to translate changed upstream ids → this resource's
 * changed ids). Load-bearing: the tasks/attempts/agents cascade rides these
 * derived edges (via `queryResource`'s `edges` or the public `compileEdges`).
 */
export interface Edge {
  upstream: Resource<unknown, ResourceParams>;
  hops: Hop[];
  signature?: DependsOnEntry["signature"];
}

/**
 * The declarative input to `compileQuery` / `queryResource`. One constrained
 * drizzle declaration from which the compiler derives the full loader, the
 * scoped loader, the `identityTable`, and the client keyField.
 */
export interface QueryResourceSpec<P extends ResourceParams = ResourceParams> {
  /** The relation to read: a base table, a 1:1 identity view, or an entity. */
  from: QuerySource;
  /**
   * Required in full for a `PgView` (a view carries no primary-key metadata,
   * and its identity base cannot be derived at module eval — the
   * `View({ view, identityTable })` contribution is only collected at boot,
   * after `queryResource(...)` has already resolved); usable as an override
   * elsewhere. `pk` is the identity column; `table` names the base table the
   * identity scopes to (defaults to the entity/table name for non-views).
   */
  identity?: { table?: string; pk: PgColumn };
  /** Projection. Default: an entity's `wireColumns`, or all columns (table/view). */
  select?: SelectMap;
  /**
   * Static predicate or a per-params one (`(params) => SQL | undefined`).
   *
   * RULE: under the default `identityTable` scoping, every column the `where`
   * reads must be IMMUTABLE post-insert. An UPDATE that flips a `where` column
   * removes the row from the result set, but the scoped refill can only upsert
   * rows it gets back — `diffKeyedScoped` never emits deletes — so the excluded
   * row would sit stale in every client snapshot until the next FULL. A `where`
   * on a mutable column (a `dismissed` flag, a status) MUST pair with
   * `recompute: { kind: "full", … }`. See the plugin CLAUDE.md.
   */
  where?: SQL | ((params: P) => SQL | undefined);
  /** Static ORDER BY — applied to the FULL query only (never the scoped refill). */
  orderBy?: SQL | SQL[];
  /** Static LIMIT — applied to the FULL query only. Pairs with `recompute`. */
  limit?: number;
  /**
   * Explicit FULL opt-out for reads whose per-id scoped refill would corrupt or
   * stale the snapshot: windowed/LIMIT reads (a row entering/leaving the window
   * is a membership change) and mutable-column `where` filters (see `where`).
   * Selects the `{ recompute }` scope policy; the loader then always runs the
   * FULL query and ignores `ctx.affectedIds`.
   */
  recompute?: { kind: "full"; reason: string };
  /** `rel()` cascade edges — compiled into `dependsOn` (see `Edge`). */
  edges?: Edge[];
  /** Fixed-window trailing debounce (ms) for this resource's flushes. */
  debounceMs?: number;
  /** Test seam. Defaults to the real per-worktree drizzle `db`. */
  db?: QueryDb;
}
