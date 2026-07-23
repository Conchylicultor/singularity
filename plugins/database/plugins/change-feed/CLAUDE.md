# change-feed

## The trigger rebuild: fingerprint fast-path, then single-relation transactions

`rebuildTriggers` (`internal/triggers.ts`) installs the feed by `DROP+CREATE
TRIGGER`ing every non-excluded public table. Boot is the worst possible moment to
hold table locks:

- the **previous backend is still serving reads** of those same tables (the
  hot-swap is ready-gated — it does not stop until the new backend is ready,
  holding `AccessShare` locks throughout), and
- this hook runs alongside the database plugin's own `onReadyBlocking` (migrations
  → rollup reconcile → view rebuild): `onReadyBlocking` hooks run under a flat
  `Promise.all` with no topo order.

### Fast-path: skip when unchanged

Mirroring the identical fast-path in
[`derived-views`](../derived-views/server/internal/rebuild.ts): the trigger layer
is a pure function of (schema, denylist, emitted DDL), so the compiled DDL is
fingerprinted into `live_state_trigger_state` and **the rebuild is skipped
entirely when the signature matches what is already live**. A steady-state restart
— the overwhelming majority of boots, since any frontend-only commit leaves the
trigger set untouched — takes **zero table locks**. The lock window only opens on
a genuine schema/denylist change.

**The signature is never trusted alone.** `triggerLayerUpToDate` re-verifies from
the catalog that the function, the changelog table, and every expected trigger
physically exist, and that no `live_state_*` trigger lingers on an excluded table.
Anything dropped out of band falls through to a real rebuild. (It reads only
catalogs — no user-table locks, which is the whole point.)

The signature row lives in the DB so a worktree fork carries it with its triggers
(`CREATE DATABASE … TEMPLATE` copies both), so a fork skips the rebuild too rather
than paying a spurious first-boot one.

### The real rebuild: one transaction per relation (deadlock impossible)

When a rebuild *is* needed, it is **never** one transaction over the whole schema.
The old design `DROP+CREATE TRIGGER`d every table in **one** transaction, so
mid-rebuild it held `AccessExclusive` locks on an alphabetically-ordered prefix of
the database *while still asking for more* — textbook hold-and-wait. During the
hot-swap the old backend's reads lock those same tables in the opposite order,
closing a lock cycle; Postgres shot the rebuild transaction, the error escaped
`onReadyBlocking`, and the deploy failed leaving the old code live (build
`build-1784288281433-w62dep` died exactly this way: `attempts` ⇄ `conversations`,
SQLSTATE `40P01`).

The fix is structural: **the rebuild is split so no transaction ever holds more
than one relation's exclusive lock.** A transaction that only ever locks one
relation cannot be a node in a wait cycle — it acquires that one lock or blocks on
exactly one holder (an old-backend reader, which is not itself waiting on us for a
second relation). The wait-for graph is a forest by construction; **the deadlock
is impossible, not retried** (there is no `lock_timeout`, no retry loop). A
per-table tx can still *block* briefly on a live reader's `AccessShare` lock, but
the old backend's reads are short (ms), so this is a wait, not a hang.

The rebuild runs in three phases, each its own `db.transaction`:

1. **Prelude tx** — `ensureChangelogTable` + `CREATE OR REPLACE FUNCTION
   live_state_notify`. The function must exist and be committed before any trigger
   references it. Neither statement takes a user-table `AccessExclusive` lock.
2. **Per-relation txs** — one transaction **per table**: for each desired table,
   its full `DROP…IF EXISTS` + `CREATE` set for all three ops; for each stale
   (now-excluded) table still carrying `live_state_*` triggers, just its drops.
   Each touches exactly one table.
3. **Signature-stamp tx** — `TRIGGER_STATE_DDL` + the signature upsert, **last**,
   only after every per-relation tx commits.

Three self-healing invariants make this safe:

- **No object is ever half-built.** Each table's `DROP…IF EXISTS` + `CREATE` is in
  one tx, so the table always has a *complete* trigger set — old or new, never
  none. The notify function is committed first, so old and new triggers both call
  the current function. **No feed event is lost**: a write mid-rebuild fires
  whichever trigger version is installed, and both emit a compatible NOTIFY
  through the same committed function.
- **"Done" is recorded last.** The signature is stamped only after all per-table
  txs commit, and is trusted only alongside the catalog re-verify. A boot that
  dies mid-loop never records a matching signature ⇒ the next boot re-runs the
  full (idempotent, `DROP…IF EXISTS` + `CREATE`) rebuild ⇒ converges.
- **Partial state is "old-but-working," never "broken."** The only thing lost vs.
  one-big-tx is "all tables flip in the same instant," which nothing consumes
  (triggers are independent, all call the same function). Worst case is a loud
  error on a concurrent write, self-healed next boot — never silent corruption.

## Boot-time reconciliation against consumers

The feed enforces two invariants against its consumers at boot (in
`onReadyBlocking`, after triggers are installed) — not via a static
`./singularity check`, because neither can reach a live DB nor the server-only
contribution/registry sets:

- **`warnOnCoverageGaps`** (`internal/triggers.ts`) — warns if any non-excluded
  public table is missing its `live_state_*` triggers (drift signal; should always
  be empty by construction).
- **`assertScopePoliciesCovered`** (`internal/identity-coverage.ts`) — **throws
  (blocks boot)** if any keyed live-state resource declares an `identityTable` on a
  table the feed installed **no trigger** on. Scoped delivery fires only on
  `origin === identityTable`, and only a triggered table ever produces that origin,
  so such a policy is dead config that silently degrades the resource to
  hydrate-on-mount. The single authoritative test is membership in
  `getCoveredTables()` (the set `rebuildTriggers` just installed) — which subsumes
  the `ExcludeFromChangeFeed` case AND catches the other ways an `identityTable`
  ends up untriggered: a **VIEW name** instead of its base table (the documented
  resource-runtime footgun), a feed-exempt **derived-table rollup**, or a **typo /
  dropped table**. A legitimate base table is in the covered set by construction,
  so a miss is never a false positive. Each violation is classified (`excluded` /
  `rollup` / `uncovered`) so the error carries the right remediation. It
  cross-checks the resource-runtime's `scopedResourceIdentities()` (surfaced
  through `server-core`) against `getCoveredTables()`, using `excludedTableNames()`
  + `feedExemptTables()` only to label the reason. This catches hand-written AND
  query-resource-compiled resources uniformly, because the check reads the
  runtime's stored `identityTable` string, not source text. Fix: point the resource
  at a real triggered base table (not a view/rollup), drop the exclusion, or make
  it a plain push resource with no `identityTable` (like
  `reportsResource`/`slowOpsResource`).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: L4 DB change-feed: STATEMENT-level Postgres triggers that pg_notify on every commit, plus a LISTEN consumer routing each change through the live-state recompute cascade — making missed invalidations structurally impossible and out-of-process writes visible.
- Server:
  - Uses: `database.db`, `database/admin.connectionString`, `database/derived-tables.feedExemptTables`, `database/derived-views.relationIdentityBase`, `primitives/log-channels.defineLogSink`
  - Exports: Types: `DbChange`; Values: `ensureChangelogTable`, `ExcludeFromChangeFeed`, `getCoveredTables`, `parseLiveStatePayload`, `rebuildTriggers`, `routeChange`
- Cross-plugin:
  - Imported by: `database/live-state-snapshot`, `debug/slow-ops`, `debug/trace/engine`, `reports`

<!-- AUTOGENERATED:END -->

## Invariant harness (DB-backed)

`server/internal/listener.test.ts` pins the LISTEN consumer against a **real
Postgres** — the DB-backed half the resource-runtime fake-injection seam can't
reach. It covers: NOTIFY delivery (`LISTEN live_state` → `parseLiveStatePayload`
→ `route`), first-connect-does-NOT-fullSweep vs reconnect-DOES-fullSweep (driven
by a real socket drop via `pg_terminate_backend`), malformed-payload skip, and
`stop()` teardown. The listener is exercised at its true contract boundary —
`pg_notify('live_state', <payload>)`, the exact wire the STATEMENT trigger emits
— so it needs no triggers or tables of its own (trigger→NOTIFY→changelog is the
trigger layer's concern, exercised at every boot's `rebuildTriggers`).

To make it testable, `listener.ts` is an injectable factory
(`createChangeFeedListener({ connectionString, route, coveredTables, …timers })`)
with all state per-instance; the production singleton is re-presented as the same
`startListener`/`stopListener` exports. The shared `db-test-fixture` primitive
(`createTestDb({ prefix: "cf_test" })`) provisions an isolated throwaway database
on the running cluster via admin's public barrel
(`ensureDatabase`/`openShortLivedClient`/`dropDatabase`) and drops it after.

**Running:** these suites need a running cluster (started by `./singularity
build`) — run with a plain `bun test plugins/database/plugins/change-feed`. No
`SINGULARITY_WORKTREE=<worktree>` prefix: the root `bunfig.toml` `[test]` preload
(`test/bun-preload.ts`) defaults it to the current checkout when unset. The
fixture throws loudly (never silently skips) if the cluster is unreachable. See
`research/2026-07-03-database-live-state-db-backed-invariant-harness.md`.
