import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";
import { defineReportSink } from "@plugins/primitives/plugins/report-sink/core";

// A client-side deadline on every query through the app pool, and what happens
// to the connection when one is missed. See
// research/2026-09-11-global-query-deadline-and-stall-health.md (Part 1) and the
// incident it answers, research/2026-09-11-global-live-updates-frozen-by-stray-fd-close.md:
// a pooled socket was closed underneath a running query, `pg` got no event, and
// with no deadline anywhere the query — and the live-state flush awaiting it —
// waited forever.

/** How long a query may run before its caller gets a `QueryDeadlineExceededError`. */
export const QUERY_DEADLINE_MS = 60_000;

/**
 * The bound boot DDL opts into via `withQueryDeadline` — migrations and the
 * derived-table / derived-view / change-feed-trigger rebuilds can legitimately
 * wait minutes on the previous backend's locks during a hot-swap.
 */
export const BOOT_DDL_QUERY_DEADLINE_MS = 15 * 60_000;

/**
 * What the deadline tells the outside world, through `queryDeadlineSink`.
 *
 * - `deadline` — one query missed its deadline and its connection was abandoned.
 *   `sql` is the query's label exactly as its `<sql>` profiler span records it;
 *   `origin` is the innermost runtime-profiler entry that issued it (a resource,
 *   route or job label), `null` when context-less (boot, migrations);
 *   `leased` is true for a query on a checked-out client (`db.transaction()`),
 *   false for a plain `pool.query`; `reason` is the enclosing
 *   `withQueryDeadline` scope's reason, `null` under the default bound.
 * - `abandon-cap` — an abandon landed after `cap` connections were already
 *   being held; this one is detached from the pool but no longer retained (see
 *   `abandonClient`). `abandoned` counts every abandon since boot.
 *
 * `at` is epoch ms (`Date.now()`).
 */
export type QueryDeadlineEvent =
  | {
      kind: "deadline";
      at: number;
      sql: string;
      elapsedMs: number;
      deadlineMs: number;
      origin: string | null;
      leased: boolean;
      reason: string | null;
    }
  | { kind: "abandon-cap"; at: number; abandoned: number; cap: number };

// The database plugin cannot file a report itself — `reports` depends on
// `database` — so it emits here and a sub-plugin that may import both registers
// the handler (same shape as jobs → jobs/deadline-audit). Fire-and-forget, and
// emissions before the handler registers are held, not dropped.
export const queryDeadlineSink = defineReportSink<QueryDeadlineEvent>();

/**
 * A query got no reply within its deadline. The caller's promise rejects with
 * this; the connection it ran on has been abandoned (never reused, never closed).
 *
 * Deliberately carries no `code`: the pool's 40P01/40001 retry keys on
 * `err.code`, and a lost query must never be re-run on another connection behind
 * the caller's back.
 */
export class QueryDeadlineExceededError extends Error {
  override readonly name = "QueryDeadlineExceededError";
  readonly sql: string;
  readonly elapsedMs: number;
  readonly deadlineMs: number;
  readonly origin: string | null;
  readonly leased: boolean;
  readonly reason: string | null;

  constructor(fields: {
    sql: string;
    elapsedMs: number;
    deadlineMs: number;
    origin: string | null;
    leased: boolean;
    reason: string | null;
  }) {
    super(
      `Database query got no reply within ${fields.deadlineMs}ms ` +
        `(${fields.elapsedMs}ms elapsed${fields.origin ? `, issued by ${fields.origin}` : ""}` +
        `${fields.reason ? `, bound: ${fields.reason}` : ""}); ` +
        `its connection was abandoned. sql: ${fields.sql.slice(0, 200)}`,
    );
    this.sql = fields.sql;
    this.elapsedMs = fields.elapsedMs;
    this.deadlineMs = fields.deadlineMs;
    this.origin = fields.origin;
    this.leased = fields.leased;
    this.reason = fields.reason;
  }
}

interface QueryDeadlineScope {
  ms: number;
  reason: string;
}

// Local to the database plugin and independent of the runtime-profiler's
// stores: the bound is a property of the work, not of how it is attributed.
const deadlineScope = new AsyncLocalStorage<QueryDeadlineScope>();

/**
 * Run `fn` with every app-pool query it issues (awaited, at any depth) bounded
 * by `ms` instead of the default `QUERY_DEADLINE_MS`. `reason` names the scope
 * on the error and the report. An inner scope replaces an outer one.
 */
export function withQueryDeadline<T>(
  scope: { ms: number; reason: string },
  fn: () => Promise<T>,
): Promise<T> {
  if (!Number.isFinite(scope.ms) || scope.ms <= 0) {
    throw new RangeError(
      `withQueryDeadline: ms must be a positive finite number, got ${scope.ms}`,
    );
  }
  return deadlineScope.run({ ms: scope.ms, reason: scope.reason }, fn);
}

/** The bound in force at the call site. Read synchronously, before any await. */
export function currentQueryDeadline(defaultMs: number): {
  deadlineMs: number;
  reason: string | null;
} {
  const scope = deadlineScope.getStore();
  return scope
    ? { deadlineMs: scope.ms, reason: scope.reason }
    : { deadlineMs: defaultMs, reason: null };
}

// ---------------------------------------------------------------------------
// Abandoning a connection.
//
// A missed deadline means the connection's socket may be dead in a way `pg`
// cannot see — in the incident, its fd had been closed by someone else. By the
// time the deadline fires that fd NUMBER is free and probably reused by some
// other resource (a pipe, a temp file, another pg socket). Closing the client
// (`client.end()` → `stream.destroy()`, which pg-pool's `_remove` and
// `release(err)` always do) would close THAT resource: a new victim per
// incident, possibly another pooled socket, so a cascade every deadline.
//
// So the client is ABANDONED: detached from the pool, never closed. The cost for
// a query that was merely slow is one leaked pgbouncer client connection; a late
// reply can only resolve an already-rejected promise, a no-op, because pg-pool
// never hands the client out again.
// ---------------------------------------------------------------------------

/** How many abandoned clients are kept strongly reachable. */
export const ABANDON_HOLD_CAP = 32;

/**
 * The strong-reference hold for abandoned clients, so GC finalization can never
 * close their fd later. Bounded: past `cap` a newly abandoned client is still
 * detached from the pool but not retained, and each such abandon is emitted as
 * `abandon-cap` — by then something is badly wrong and a human must look.
 */
export class AbandonedClientHold {
  private readonly held = new Set<PoolClient>();
  private readonly seen = new WeakSet<PoolClient>();
  private count = 0;

  constructor(readonly cap: number) {}

  /** Every abandon since this hold was created. */
  get abandoned(): number {
    return this.count;
  }

  /** How many abandoned clients are strongly held right now (≤ cap). */
  get size(): number {
    return this.held.size;
  }

  has(client: PoolClient): boolean {
    return this.seen.has(client);
  }

  /** Record one abandon; emits `abandon-cap` when the hold is already full. */
  retain(client: PoolClient): void {
    this.seen.add(client);
    this.count++;
    if (this.held.size < this.cap) {
      this.held.add(client);
      return;
    }
    queryDeadlineSink.emit({
      kind: "abandon-cap",
      at: Date.now(),
      abandoned: this.count,
      cap: this.cap,
    });
  }
}

const abandonedClients = new AbandonedClientHold(ABANDON_HOLD_CAP);

// pg-pool 3.13 has no public detach-without-end, so abandoning reaches into
// its internals: `_clients`, `_idle` (and each idle item's `idleListener` /
// `timeoutId`) and `_pulseQueue`. They are read through this one accessor (and pinned by
// query-deadline.test.ts), so an upgrade that renames them fails loudly — at
// pool build (`assertPgPoolInternals`) and in the test — rather than silently
// leaving an abandoned client counted in the pool.
interface PgPoolInternals {
  /** Every client the pool owns, checked out or idle; `totalCount` is its length. */
  _clients: PoolClient[];
  /**
   * Idle clients, each with its idle-timeout timer and the pool's `error`
   * listener (attached only while idle; its firing `end()`s the client).
   */
  _idle: {
    client: PoolClient;
    idleListener: (err: Error) => void;
    timeoutId: ReturnType<typeof setTimeout> | undefined;
  }[];
  /** Hands the next queued checkout a client, building one if under `max`. */
  _pulseQueue(): void;
}

function readPgPoolInternals(pool: Pool): PgPoolInternals {
  const p = pool as unknown as Partial<PgPoolInternals>;
  if (
    !Array.isArray(p._clients) ||
    !Array.isArray(p._idle) ||
    typeof p._pulseQueue !== "function"
  ) {
    throw new Error(
      "pg-pool internals changed: abandonClient needs Pool#_clients, Pool#_idle and " +
        "Pool#_pulseQueue (pg-pool 3.13). Re-check abandonClient in " +
        "plugins/database/server/internal/query-deadline.ts against the new pg-pool.",
    );
  }
  return p as PgPoolInternals;
}

/** Throws unless `pool` exposes the pg-pool internals `abandonClient` relies on. */
export function assertPgPoolInternals(pool: Pool): void {
  readPgPoolInternals(pool);
}

// Named so a heap snapshot says why the listener is there.
function ignoreAbandonedClientEvent(): void {}

/**
 * Take `client` out of `pool` for good WITHOUT closing it. Idempotent.
 *
 * 1. Attach permanent no-op `error` and `end` listeners first. A checked-out
 *    client has no pool listener, and a detached one never gets one back — a
 *    later socket error with no listener is an unhandled `'error'` that crashes
 *    the process.
 * 2. Remove it from pg-pool's `_clients` and `_idle` (clearing its idle timer
 *    and the pool's idle `error` listener, either of which would `end()` it),
 *    so `totalCount` drops; then pulse the queue
 *    so a waiting checkout gets a replacement now rather than on the next
 *    release. Never `client.end()` / `release(err)`: both close the fd.
 * 3. Hold a strong reference (`AbandonedClientHold`).
 */
export function abandonClient(
  pool: Pool,
  client: PoolClient,
  hold: AbandonedClientHold = abandonedClients,
): void {
  if (hold.has(client)) return;
  client.on("error", ignoreAbandonedClientEvent);
  client.on("end", ignoreAbandonedClientEvent);

  const internals = readPgPoolInternals(pool);
  const idleIndex = internals._idle.findIndex((item) => item.client === client);
  if (idleIndex !== -1) {
    // Only reachable for an idle client (a deadline always abandons a
    // checked-out one, which pg-pool has already stripped of both).
    const [item] = internals._idle.splice(idleIndex, 1);
    clearTimeout(item!.timeoutId);
    client.removeListener("error", item!.idleListener);
  }
  const clientIndex = internals._clients.indexOf(client);
  if (clientIndex !== -1) internals._clients.splice(clientIndex, 1);

  hold.retain(client);
  internals._pulseQueue();
}
