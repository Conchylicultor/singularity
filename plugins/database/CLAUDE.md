# database

Owns all database infrastructure for the Singularity server:

- **Connection pooling** — `db` (Drizzle instance), `pool` / `adminPool` (raw pg pools), `openShortLivedClient`, `connectionString`, `libpqSubprocessEnv`, `isTransientPgError`, `awaitPgReady`.
- **Migrations** — SQL files live in `plugins/database/plugins/migrations/data/`; `drizzle.config.ts` lives at `plugins/database/plugins/migrations/drizzle.config.ts`. The migration runner lives in `plugins/database/plugins/migrations/server/`.
- **Embedded Postgres constants & helpers** — `plugins/database/plugins/embedded/`.
- **DB query MCP tool** — `plugins/database/plugins/query/` (read-only agent inspection tool).

## Runtime query profiling

`pool.query` is wrapped (in `server/internal/client.ts`) to record per-query
timing into the runtime-profiler recorder (`db` spans). The promise form is
reimplemented to split the two phases node-postgres collapses into one — it
emits a separate **`[acquire]`** span for connection checkout (pool queue-wait +
pgbouncer backend establishment) and a **`<sql text>`** span for pure execution
on an already-acquired client. This keeps a trivial query from reading as
multi-second right after a restart when the cost is really cold-connection
acquisition; a spiking `[acquire]` aggregate is the signal for that. Each `db`
span is attributed to the innermost enclosing request/loader (its `parent`) via
the recorder's ambient context, so N+1 patterns point straight at the caller.
**Direct `pool.connect()` → `client.query` paths bypass this timing** (e.g.
`awaitDbReady`'s `SELECT 1` and `warmPool`) — they go through a checked-out
client, not `pool.query`, so their durations are not recorded.

`warmPool()` (called in `onReadyBlocking`, after `awaitDbReady` and before migrations)
eagerly opens + validates connections up to the pool's `max` so the boot
thundering herd hits warm connections instead of paying establishment cost.
node-postgres `min` does **not** pre-connect, so this explicit step is required.

## Connection lanes (interactive vs background)

Every shared DB-capacity layer is partitioned by **origin class**, not by caller
kind. `currentOriginClass()` (runtime-profiler) walks the ambient entry chain to
its **root** and maps that root's kind to a lane:

| root entry kind | lane |
|---|---|
| `http`, `sub`, `loader` | `interactive` — a human is blocked |
| `flush`, `push`, `cascade`, `job` | `background` — nobody waits on this ms |
| *(no entry)* | ungated — boot, migrations, `warmPool`, graphile, the change-feed listener |

Reading the **root** rather than the innermost entry is the whole point: inside a
resource load the innermost caller kind is `loader` no matter *why* the load runs,
so the old `currentCallerKind()` gate could not distinguish a human's cold sub-ack
load from a cascade recompute — and queued the human behind hundreds of them.
`runInBackgroundLane(fn)` overrides the walk for work that is background whatever
triggered it (the observability writes; job cleanup).

Two gates, both on `createSemaphore`, both read synchronously before any await:

- **`backgroundQueryGate`** (`BACKGROUND_QUERY_MAX = 7`) — every background-origin
  `pool.query`. Wait charged to the enclosing entry as `background-acquire` (the
  former `loader-acquire`; renamed because jobs, `flush`'s own queries, and
  observability writes charge to it now, while a `sub`-origin loader does not).
- **`backgroundTxGate`** (`BACKGROUND_TX_MAX = 3`) — a **lease**, not a scope, over
  `pool.connect()`: taken when the client is handed out, freed when
  `client.release()` is called. This is the path `db.transaction()` takes, which
  until now bypassed both the wrapper *and* the reservation — inflated background
  transactions ate all 16 connections including the reserved 6. Wait charged as
  `background-tx-acquire`.

Interactive and context-less work runs **ungated**, so boot can never deadlock on a
gate and a human always finds a connection. Interactive demand is already bounded
upstream by `readLoadGate` (`READ_LOAD_CONCURRENCY = 6`) and the per-route endpoint
concurrency gates.

### The lane-capacity invariant is a deadlock proof

```
BACKGROUND_TX_MAX + BACKGROUND_QUERY_MAX ≤ POOL_MAX − RESERVED_INTERACTIVE
        3         +          7           ≤    16    −         6
```

A background transaction pins a connection for its whole life and may `await` a
plain `pool.query` inside its callback. Under **one** shared background gate, N
transactions each holding a slot while awaiting a slot for their inner query
deadlock the lane permanently. Under **two**, the wait-for graph is acyclic by
construction — `bg-tx → bg-query → pool connection → {interactive, boot}` — and
the terminal holders always complete: bg-tx holders pin ≤3 connections and
bg-query holders ≤7, so ≥`RESERVED_INTERACTIVE` connections always remain free for
the query holders to finish and release the slots the transactions wait on. The
inequality is asserted at module load, not left in prose. **Never raise either cap
without re-checking it.**

Transaction hold-time is bounded by two halves of one guardrail: the
`database/no-pool-await-in-transaction` ESLint rule (no awaiting the pool inside a
`db.transaction` callback — hold-and-wait), and the **required** `exec` parameter on
query helpers like `listBlockingDepIds`, which turns the transitive version of that
leak into a tsc error.

Gating at the query (rather than around whole loader bodies) puts the gate on the
actual scarce resource — held connections — so an in-memory loader that issues no
query never waits. (It replaced an older semaphore that wrapped whole loader
*bodies* in `server-core/core/resources.ts`.) Waits are charged to the enclosing
entry so `work = total − Σwaits` stays readable per span; the pool's own
`[acquire]` (connect) and `<sql>` (execute) leaf spans remain.

See `research/2026-07-09-global-interactive-lane-origin-based-db-gating.md` and its
forensic companion `research/2026-07-09-global-interactive-lane-under-load.md`; also
`research/2026-06-19-global-live-state-unified-read-path-v2.md` (Task 2) and
`research/2026-06-19-global-wait-attribution-instrumentation.md`.

## Import-safety (lazy pool)

Importing `@plugins/database/server` has **no side effects** and never reads
`SINGULARITY_WORKTREE`. The pg pool is built by a lazy `pool()` singleton on the
first real query/connection; `db` is a thin forwarding Proxy over a
lazily-constructed real drizzle instance (`server/internal/client.ts`). A missing
worktree stays **loud** — the first `db.<method>()` (or `awaitDbReady`/`warmPool`)
throws `SINGULARITY_WORKTREE env var is required` — but the throw no longer fires
at module eval. This is what lets any `bun:test` transitively import a server
module near the DB and inject a fake `db` without a per-suite env shim. The Proxy
forwards to a **real `pg.Pool`-backed** drizzle instance (not a fake), so
`db.transaction()` — which drizzle gates on `client instanceof Pool` — keeps
working. Do not reintroduce an eager `new Pool(requireWorktree())` at module top.

The lazy pool keeps *import* safe; a **`bun test` preload** (`test/bun-preload.ts`,
registered in the root `bunfig.toml` `[test]` section) then defaults
`SINGULARITY_WORKTREE` to the current checkout when unset, so a suite that issues a
real query — or that touches any other worktree-scoped throw (the per-worktree log
dir, config_v2) — runs with `bun test <path>` and no `SINGULARITY_WORKTREE=<worktree>`
prefix. The throws stay loud in production; only test runs get the default.

## Bootstrap

`awaitPgReady` + `runMigrations` are called in the database plugin's `onReadyBlocking` hook. `onReadyBlocking` is a hard barrier the framework awaits in full before flipping the server-ready flag and before any plugin's `onReady` runs — so consumers can safely use the DB in their own `onReady`, and the gateway holds its hot-swap until migrations have landed. (Previously this lived in `onReady`, where it raced other plugins' `onReady` and the gateway swap until migrations happened to be slow.)

## Import paths

```typescript
// Drizzle instance, pools, helpers
import { db, pool, adminPool, awaitPgReady, connectionString } from "@plugins/database/server";

// Embedded Postgres constants
import { ... } from "@plugins/database/plugins/embedded/server";
import { ... } from "@plugins/database/plugins/embedded/shared";
```

## Schema change workflow

Edit `plugins/{name}/server/internal/tables.ts` → run `./singularity build`. The build regenerates migrations and restarts the server, which applies them via the `onReady` hook. Never run `drizzle-kit generate` or the migration runner directly.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Core database infrastructure. Connection pooling and DB readiness.
- Load-bearing: yes
- Server:
  - Uses: `database/derived-tables.rebuildDerivedTables`, `database/derived-views.rebuildDerivedViews`, `database/migrations.runMigrations`, `primitives/log-channels.Log`
  - Exports: Values: `awaitDbReady`, `db`, `isTransientDbError`
- Core:
  - Uses: `infra/paths.SINGULARITY_DIR`
  - Exports: Types: `DatabaseConfig`, `DatabaseProvider`; Values: `buildConnectionString`, `DATABASE_CONFIG_PATH`, `readDatabaseConfig`
- Cross-plugin:
  - Imported by: `active-data`, `apps/browser/bookmarks`, `apps/browser/history`, `apps/deploy/servers`, `apps/mail/attachments`, `apps/mail/inbox`, `apps/mail/mail-core`, `apps/mail/mailbox`, `apps/mail/sync`, `apps/mail/thread-list`, `apps/pages/content-search`, `apps/pages/history`, `apps/sonata/library`, `apps/sonata/playback-history`, `apps/sonata/rich/key-mode`, `apps/sonata/sources/chord-grid`, `apps/sonata/sources/midi`, `apps/sonata/track-mixer`, `apps/sonata/transpose`, `apps/story/generation`, `apps/story/marker`, `apps/studio/contributions/tables/columns`, `apps/studio/contributions/tables/foreign-keys`, `apps/studio/contributions/tables/indexes`, `apps/studio/contributions/tables/row-count`, `apps/studio/contributions/tables/sample-rows`, `apps/website/blog/publish`, `apps/workflows/engine`, `backup`, `build`, `build/build-commits`, `config_v2/staging`, `conversations`, `conversations/agents`, `conversations/all-conversations`, `conversations/conversation-preprompt`, `conversations/conversation-progress`, `conversations/conversation-view/notes`, `conversations/conversation-view/turn-summary`, `conversations/conversations-view/grouped`, `conversations/conversations-view/queue`, `conversations/session-chain`, `conversations/summary`, `database/change-feed`, `database/live-state-snapshot`, `debug/boot-profile`, `debug/profiling/boot-bench`, `debug/slow-ops`, `debug/trace/engine`, `history/engine`, `improve`, `infra/attachments`, `infra/claude-cli`, `infra/contention`, `infra/entity-extensions`, `infra/events`, `infra/events-test`, `infra/jobs`, `infra/query-resource`, `infra/retention`, `page/attachment-block`, `page/editor`, `page/editor-collab`, `page/inline-date`, `page/links`, `plugin-meta/plugin-health`, `primitives/data-view/custom-columns`, `primitives/data-view/view-order`, `primitives/rank`, `release`, `reports`, `search/engine`, `shell/notifications`, `stats/commits`, `stats/cost`, `tasks`, `tasks/auto-start`, `tasks/task-effort`, `tasks/task-preprompt`, `tasks/tasks-core`, `ui/tweakcn`, `ui/tweakcn/community-browser`
- Sub-plugins:
  - **`admin`** — Admin operations for the database plugin — fork, backup, drop, list.
  - **`change-feed`** — L4 DB change-feed: STATEMENT-level Postgres triggers that pg_notify on every commit, plus a LISTEN consumer routing each change through the live-state recompute cascade — making missed invalidations structurally impossible and out-of-process writes visible.
  - **`db-test-fixture`** — Shared throwaway-database fixture for DB-backed test suites.
  - **`derived-tables`** — Rebuilds trigger-maintained materialized rollup tables from source on every boot. A rollup is derived state (declared via the DerivedTable contribution), kept current incrementally by STATEMENT triggers — a hand-rolled IVM for aggregates too expensive to recompute live yet not expressible as a plain view.
  - **`derived-views`** — Rebuilds plain DB views from source on every boot, in dependency order. Plain views are derived code (declared via the View contribution), not stateful migration schema.
  - **`embedded`** — Embedded Postgres binaries for the gateway-owned cluster. Provides shared connection constants used by every worktree backend.
  - **`fork`** — Durable, self-healing worktree DB fork: a graphile job that forks the singularity DB per worktree (idempotent, atomic), plus a scheduled sweep of orphaned temp forks.
  - **`live-state-snapshot`** — L2 persisted live-state materialization: durable snapshot + xmin watermark for instant cold boot, with a bounded changelog catch-up that recomputes only the resources whose tables changed during downtime.
  - **`migrations`** — DDL lifecycle: migration runner and SQL files.
  - **`pgbouncer`** — PgBouncer connection pooler for the embedded Postgres cluster. Provides path constants for connection routing.
  - **`query`** — MCP tool for agents to query worktree databases for debugging and inspection.
  - **`zero`** — Umbrella for the Rocicorp Zero sync-engine infrastructure: shared constants (core), the zero-cache supervised service (cache-service), and the generic client provider + adapter (client). Domain-agnostic — no concrete schema.

<!-- AUTOGENERATED:END -->
