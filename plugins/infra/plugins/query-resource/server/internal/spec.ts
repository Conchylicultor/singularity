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
   * RULE: under the plain `identityTable` scoping, every column the `where`
   * reads must be IMMUTABLE post-insert. An UPDATE that flips a `where` column
   * removes the row from the result set, but the scoped refill can only upsert
   * rows it gets back — `diffKeyedScoped` never emits deletes — so the excluded
   * row would sit stale in every client snapshot until the next FULL. A `where`
   * on a mutable column (a `dismissed` flag, a status) must therefore pair with
   * EITHER `recompute: { kind: "full", … }` OR `scopedMembership: true`. The
   * latter is now the preferred choice for a non-windowed scan: a where-flip is
   * detected as a membership EXIT (the refill fails to return a requested id) and
   * shipped as a real delete + order, so the row leaves every client snapshot
   * without a whole-list FULL. See the plugin CLAUDE.md.
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
  /**
   * Opt into row-level membership scoping (M5). Emits a `scopedMembership` server
   * option so an INSERT/DELETE/where-flip on the identity table no longer forces a
   * FULL recompute: the compiler derives the `orderOf` ids-only ordered-membership
   * query the runtime runs ONLY when a row ENTERS membership, and the runtime
   * reconciles exits/entries against the per-pk snapshot, shipping an incremental
   * delta that asserts `order`.
   *
   * Incompatible with `limit` and `recompute` — a windowed/LIMIT read cannot
   * membership-scope (a row entering/leaving the window is a membership change a
   * per-id refill can't place), and `recompute: { full }` is the opposite policy
   * (no identityTable to scope against). `compileQuery` throws (module eval) on
   * either combination. It also RELAXES the mutable-`where` rule above — a
   * where-flip becomes a detected exit/entry — so it is the preferred choice for a
   * non-windowed mutable-`where` scan. See
   * research/2026-07-03-global-scoped-membership-m5.md.
   */
  scopedMembership?: true;
  /** `rel()` cascade edges — compiled into `dependsOn` (see `Edge`). */
  edges?: Edge[];
  /** Fixed-window trailing debounce (ms) for this resource's flushes. */
  debounceMs?: number;
  /** Test seam. Defaults to the real per-worktree drizzle `db`. */
  db?: QueryDb;
}

/**
 * One key of a bounded window's total order.
 *
 * RULE: the column MUST be UPDATE-STABLE (immutable post-insert — `createdAt`,
 * the pk, a fixed discriminator). The runtime's in-place path deliberately
 * skips `windowIdsOf` (a pure UPDATE ships one upsert, `order` omitted), so an
 * ORDER BY over a mutable column would leave the window's order stale until
 * the next membership delta — a correctness bug, not a staleness nit. Declared
 * as `{ col, dir }` pairs rather than raw `SQL` so the compiler can append the
 * pk tiebreaker (a strict total order — a window must be a prefix of it) and a
 * future cursor can derive its keyset seek from the same keys.
 */
export interface WindowOrderKey {
  col: PgColumn;
  /** Default `"asc"`. */
  dir?: "asc" | "desc";
  /** Nullable column → symmetric NULLS LAST handling (see `primitives/keyset`). Default `false`. */
  nullable?: boolean;
}

/**
 * The declarative input to `compileWindowQuery` / `windowQueryResource` — the
 * bounded-membership (window / point) sibling of `QueryResourceSpec`. Exactly
 * ONE of `window` / `point` must be declared, and it must match the descriptor
 * kind (`windowQueryResourceDescriptor` / `pointQueryResourceDescriptor`).
 * There is deliberately NO `limit` / `recompute` / `scopedMembership` here:
 * the bound comes from the subscription params (clamped to `maxLimit`), and
 * membership is always incremental.
 */
export interface WindowQueryResourceSpec<P extends ResourceParams = ResourceParams> {
  /** The relation to read: a base table, a 1:1 identity view, or an entity. */
  from: QuerySource;
  /** Same derivation rules as `QueryResourceSpec.identity`. For `point`, `point.by` IS the identity pk. */
  identity?: { table?: string; pk: PgColumn };
  /** Projection. Default: an entity's `wireColumns`, or all columns (table/view). */
  select?: SelectMap;
  /**
   * Server-fixed scope predicate (e.g. `dismissed = false`). Unlike the plain
   * `QueryResourceSpec`, a mutable-column `where` is FINE here: a where-flip is
   * detected as a membership exit/entry by the runtime's window path.
   */
  where?: SQL | ((params: P) => SQL | undefined);
  /** Window total order — REQUIRED for `window`, forbidden for `point` (point sets are unordered). */
  orderBy?: WindowOrderKey | WindowOrderKey[];
  /**
   * Ordered-window kind. `maxLimit` clamps every subscription's decoded
   * `limit` (the loader AND `windowIdsOf`, identically). The default limit
   * lives ONLY on the descriptor (`windowQueryResourceDescriptor`'s
   * `defaultLimit`) — the single source both the client hook and the boot
   * path read; the compiler asserts `defaultLimit <= maxLimit` at module eval.
   */
  window?: { maxLimit: number };
  /**
   * Explicit point-set kind. `by` is the column the subscribed id set matches —
   * it IS the resource's identity pk (the change-feed routes by intersecting
   * changed identity ids with each tuple's set, so any other column could
   * never intersect). Redundant `identity.pk`, if given, must equal it.
   */
  point?: { by: PgColumn };
  /** `rel()` cascade edges — compiled into `dependsOn` (see `Edge`). */
  edges?: Edge[];
  /** Fixed-window trailing debounce (ms) for this resource's flushes. */
  debounceMs?: number;
  /** Test seam. Defaults to the real per-worktree drizzle `db`. */
  db?: QueryDb;
}
