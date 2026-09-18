# database

Owns all database infrastructure for the Singularity server:

- **Connection pooling** — `db` (Drizzle instance), `pool` / `adminPool` (raw pg pools), `openShortLivedClient`, `connectionString`, `libpqSubprocessEnv`, `isTransientPgError`, `awaitPgReady`.
- **Migrations** — SQL files live in `plugins/database/plugins/migrations/data/`; `drizzle.config.ts` lives at `plugins/database/plugins/migrations/drizzle.config.ts`. The migration runner lives in `plugins/database/plugins/migrations/server/`.
- **Embedded Postgres constants & helpers** — `plugins/database/plugins/embedded/`.
- **DB query MCP tool** — `plugins/database/plugins/query/` (read-only agent inspection tool).

## Typed at the SQL boundary

Three sibling guardrails, one class of bug: a type written by hand where nothing
verifies it. They split by spelling — around the row, inside the row, and on the
column — so there is never a question of which one owns a site.

| you have | owner |
|---|---|
| a raw SQL **result** — `pool.query(…)`, `db.execute(sql\`…\`)` — whose rows you read | `plugins/database/plugins/sql-rows` — parse the rows (`queryRows` / `executeRows`) |
| a raw SQL **expression selected as a value** — ``sql`…` `` in a `db.select()` or a `pgView` | `plugins/database/plugins/sql-projection` — give it a decoder (`.mapWith(…)`) |
| a **column** narrower than the Postgres type under it — a string-literal union, or a shape over `jsonb`, in a `tables.ts` | `plugins/database/plugins/sql-column` — decode it (`parsedText(name, schema)` / `parsedJson(name, schema)`). A `jsonb` column whose value really is arbitrary keeps a bare `jsonb(x)` and its honest `unknown` |
| a column `defineEntity` derives from a **field record** | nothing to do — the field type's storage contribution decodes it, text and jsonb alike (`fields/{text,json,tags}/plugins/storage`); see `plugins/infra/plugins/entities/CLAUDE.md` |

All three are enforced (`sql-rows/no-unparsed-sql-rows`,
`sql-projection/no-asserted-sql-type`, `sql-column/no-asserted-column-type`), and
each plugin's `CLAUDE.md` carries the measured pg decoding facts — including the
one that catches everybody once:
**`timestamptz` has no single answer.** Through drizzle raw SQL it is a `string`;
through a raw `pg` client it is a `Date`; through a drizzle column it is a `Date`.
Nothing in the SQL shows which.

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

## Query deadline (a call with no reply fails; its connection is abandoned)

Every database call on **every backend connection** has a client-side deadline —
**60 s** by default — on both phases: **opening a connection** and **each query**.
It lives in `plugins/database/plugins/connection` (read its `CLAUDE.md`): every
pool and standalone client is built by `createDbPool` / `createDbClient`, whose
`pg.Client` subclass bounds `connect()` and `query()` on the connection itself.
Each connection is named from a closed list (`app`, `jobs-runner`,
`jobs-enqueue`, `jobs-schema`, `job-lock`, `admin`, `admin-short-lived`,
`change-feed`, `events-test`), and every expiry names its pool and phase. The
connection plugin's `CLAUDE.md` lists which code builds each one. Whole-database
DDL on the admin pool (`CREATE` / `DROP` / `RENAME DATABASE`) runs under a 10 min
bound (`database/admin`'s `runDatabaseDdl`).

Why: on 2026-09-11 a pooled socket was closed underneath a running query and the
live-state flush awaiting it waited forever
(`research/2026-09-11-global-live-updates-frozen-by-stray-fd-close.md`); on
2026-09-15 a job waited 2.5 h on a call no deadline covered
(`research/2026-09-16-global-db-call-deadline-every-connection.md`).

On expiry the caller gets `QueryDeadlineExceededError` (no `.code`, so the
deadlock retry never re-runs it), the connection is **abandoned, never closed**
(its fd may already be someone else's), later calls on it fail at once, its
`release()` / `end()` do nothing, and the event goes to `queryDeadlineSink`
(reported by `database/query-deadline`).

What the app pool (`server/internal/client.ts`) adds on top:

- **The pool is `createDbPool({ name: "app" })`.** `installQueryWrapper` keeps
  only what the app pool has: lane gates, the deadlock retry, `[acquire]` spans
  and read-set capture. It has no clock of its own.
- **One clock per attempt.** A 40P01/40001 retry re-runs the statement on a
  checked-out client, and that statement gets its own bound. A retry only follows
  a *reply* (the victim's error), so a hang still costs one bound, not five.
  Waiting for a connection and the retry backoff are not bounded.
- **The background-transaction lease frees its gate slot when its client is
  lost** (`onClientLost`), not only at `release()`: drizzle calls no `release()`
  when its `BEGIN` is what hung.
- **`withQueryDeadline({ ms, reason }, fn)`** widens (or narrows) the bound for
  every call `fn` awaits, on any connection. Boot DDL uses
  `BOOT_DDL_QUERY_DEADLINE_MS` (15 min; it can wait on the previous backend's
  locks during a hot-swap): migrations, derived-tables and derived-views
  rebuilds in this plugin's `onReadyBlocking`, and change-feed's trigger rebuild.
  The wraps sit at those call sites, not in the runners, which take `db` as a
  parameter precisely so they never import this barrel.

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
transaction-scope callback — hold-and-wait), and the **required** `exec` parameter on
query helpers like `listBlockingDepIds`, which turns the transitive version of that
leak into a tsc error.

A "transaction scope" is not only `db.transaction(cb)`. A domain may wrap one
behind its own chokepoint whose callback binds a CONTEXT object rather than the
executor — `withPageForest(scopes, cb)`, the page editor's forest-write lock,
where the executor is `ctx.tx`. Those live in the rule's `TX_SCOPE_OPENERS`
table; **add a line there when you introduce another**, or the rule goes silently
blind inside it. The branded-executor half has a worked example there too:
`PageForestTx` is mintable only by `withPageForest`, so an unlocked forest write
is a tsc error (`plugins/page/plugins/editor/CLAUDE.md`).

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

Importing `@plugins/database/server` has **no side effects** and never asks for
this process's runtime namespace. The pg pool is built by a lazy `pool()` singleton on the
first real query/connection; `db` is a thin forwarding Proxy over a
lazily-constructed real drizzle instance (`server/internal/client.ts`). A missing
worktree stays **loud** — the first `db.<method>()` (or `awaitDbReady`/`warmPool`)
throws out of `runtimeNamespace()` — but the throw no longer fires
at module eval. This is what lets any `bun:test` transitively import a server
module near the DB and inject a fake `db` without a per-suite env shim. The Proxy
forwards to a **real `pg.Pool`-backed** drizzle instance (not a fake), so
`db.transaction()` — which drizzle gates on `client instanceof Pool` — keeps
working. Do not reintroduce an eager `new Pool(runtimeNamespace())` at module top.

The lazy pool keeps *import* safe; a **`bun test` preload** (`test/bun-preload.ts`,
registered in the root `bunfig.toml` `[test]` section) then declares the current
checkout as the test process's runtime namespace, so a suite that issues a real
query — or that touches any other namespace-scoped throw (the per-worktree log
dir, config_v2) — runs with a plain `bun test <path>` and nothing set in the
environment. The throws stay loud in production; only test runs get the default.

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
  - Uses:
    - `database/connection.BOOT_DDL_QUERY_DEADLINE_MS`
    - `database/connection.createDbPool`
    - `database/connection.onClientLost`
    - `database/connection.queryText`
    - `database/connection.withQueryDeadline`
    - `database/derived-tables.rebuildDerivedTables`
    - `database/derived-views.rebuildDerivedViews`
    - `database/migrations.runMigrations`
    - `primitives/log-channels.defineLogSink`
  - Exports (types): `DbExecutor`
  - Exports (values):
    - `awaitDbReady`
    - `currentTxId`
    - `db`
    - `dbLog`
    - `isTransientDbError`
- Cross-plugin:
  - Imported by:
    - `active-data`
    - `apps/browser/bookmarks`
    - `apps/browser/history`
    - `apps/chord/song-index`
    - `apps/chord/video-availability`
    - `apps/deploy/analytics/collect`
    - `apps/deploy/analytics/dashboard`
    - `apps/deploy/deployments`
    - `apps/deploy/health`
    - `apps/deploy/servers`
    - `apps/events/event-list`
    - `apps/events/events-core`
    - `apps/events/refresh`
    - `apps/events/sources/manual`
    - `apps/mail/attachments`
    - `apps/mail/mail-core`
    - `apps/mail/sync`
    - `apps/mail/threads`
    - `apps/pages/agent-origin`
    - `apps/pages/content-search`
    - `apps/sonata/library`
    - `apps/sonata/playback-history`
    - `apps/sonata/rich/chord-mode`
    - `apps/sonata/rich/key-mode`
    - `apps/sonata/rich/rhythm-controls`
    - `apps/sonata/sources/midi`
    - `apps/sonata/track-mixer`
    - `apps/sonata/transpose`
    - `apps/studio/contributions/tables/columns`
    - `apps/studio/contributions/tables/foreign-keys`
    - `apps/studio/contributions/tables/indexes`
    - `apps/studio/contributions/tables/row-count`
    - `apps/studio/contributions/tables/sample-rows`
    - `backup`
    - `build`
    - `build/build-commits`
    - `conversations`
    - `conversations/agents`
    - `conversations/all-conversations`
    - `conversations/conversation-category`
    - `conversations/conversation-progress`
    - `conversations/conversation-view/turn-summary`
    - `conversations/conversations-view/grouped`
    - `conversations/conversations-view/queue`
    - `conversations/session-chain`
    - `conversations/summary`
    - `database/change-feed`
    - `database/db-test-fixture/worktree-db`
    - `database/live-state-snapshot`
    - `database/query-deadline`
    - `debug/boot-profile`
    - `debug/profiling/boot-bench`
    - `debug/slow-ops`
    - `debug/trace/engine`
    - `history/engine`
    - `improve`
    - `infra/attachments`
    - `infra/claude-cli`
    - `infra/entity-extensions`
    - `infra/events`
    - `infra/events-test`
    - `infra/host/contention`
    - `infra/jobs`
    - `infra/jobs/supervised-job`
    - `infra/query-resource`
    - `infra/retention`
    - `infra/trash`
    - `page/annotations/agent-access`
    - `page/annotations/agent-notes/authorship`
    - `page/annotations/instructions`
    - `page/annotations/todo/task-link`
    - `page/attachment-block`
    - `page/block-text-write`
    - `page/editor`
    - `page/editor-collab`
    - `page/inline-date`
    - `page/links`
    - `page/markdown-apply`
    - `page/page-link`
    - `page/prompt/link`
    - `plugin-meta/plugin-health`
    - `primitives/data-view/custom-columns`
    - `primitives/data-view/view-order`
    - `primitives/rank`
    - `primitives/usage-rank`
    - `release`
    - `reports`
    - `runs`
    - `search/engine`
    - `shell/notifications`
    - `stats/cost`
    - `tasks`
    - `tasks/auto-start`
    - `tasks/task-category`
    - `tasks/task-effort`
    - `tasks/task-preprompt`
    - `tasks/tasks-core`
    - `toolchain`
    - `ui/theme-engine/saved-themes`
- Core:
  - Exports (types):
    - `DatabaseConfig`
    - `DatabaseProvider`
  - Exports (values):
    - `buildConnectionString`
    - `DATABASE_CONFIG_PATH`
    - `libpqEnv`
    - `readDatabaseConfig`
- Sub-plugins:
  - **`admin`** — Admin operations for the database plugin — fork, backup, drop, list.
  - **`change-feed`** — L4 DB change-feed: STATEMENT-level Postgres triggers that pg_notify on every commit, plus a LISTEN consumer routing each change through the live-state recompute cascade — making missed invalidations structurally impossible and out-of-process writes visible.
  - **`connection`** — Every backend database connection, built one way: createDbPool / createDbClient give each pool or standalone client a name from the closed pool-name set and a pg.Client subclass that bounds connect() and every query() with a deadline (60 s, widened per scope by withQueryDeadline). A call with no reply rejects with QueryDeadlineExceededError (pool, phase, sql, origin), and its connection is abandoned — detached, held, never closed, since its fd may already be someone else's — and announced on queryDeadlineSink.
  - **`db-test-fixture`** — Shared throwaway-database fixture for DB-backed test suites.
  - **`derived-tables`** — Rebuilds trigger-maintained materialized rollup tables from source on every boot. A rollup is derived state (declared via the DerivedTable contribution), kept current incrementally by STATEMENT triggers — a hand-rolled IVM for aggregates too expensive to recompute live yet not expressible as a plain view.
  - **`derived-views`** — Rebuilds plain DB views from source on every boot, in dependency order. Plain views are derived code (declared via the View contribution), not stateful migration schema.
  - **`embedded`** — Embedded Postgres binaries for the gateway-owned cluster. Provides shared connection constants used by every worktree backend.
  - **`fork`** — Durable, self-healing worktree DB fork: a graphile job that forks the singularity DB per worktree (idempotent, atomic), plus a scheduled sweep of orphaned temp forks.
  - **`live-state-snapshot`** — L2 persisted live-state materialization: durable snapshot + xmin watermark for instant cold boot, with a bounded changelog catch-up that recomputes only the resources whose tables changed during downtime.
  - **`migrations`** — DDL lifecycle: migration runner and SQL files.
  - **`pgbouncer`** — PgBouncer connection pooler for the embedded Postgres cluster. Provides path constants for connection routing.
  - **`query`** — MCP tool for agents to query worktree databases for debugging and inspection.
  - **`query-deadline`** — Query-deadline presence: the health report's Database row (attention while a database call on any pool got no reply in the last 10 minutes, naming the latest's pool and caller, read from the db-query-deadlines push resource) and the one-line Debug → Reports summaries (pool, phase, query, caller) for the db-query-deadline and db-abandon-cap kinds. Query-deadline audit: registers a handler on the database plugin's query-deadline seam and turns each announcement into a report — db-query-deadline (error, one row per pool, phase and query label) when a call on any backend connection — opening it or a query on it — got no answer before its deadline and its connection was abandoned, db-abandon-cap (error, one rolling row) when the abandoned connections exceed the cap — and keeps the last 20 hits in memory as the db-query-deadlines push resource behind the health report's Database row.
  - **`sql-column`** — Decoded columns: `parsedText` / `parsedJson` derive a column's type from a zod schema that really decodes it — on every read and every write — so a column can no longer declare a string-literal union, or a jsonb shape, that nothing verifies.
  - **`sql-projection`** — Mapped raw-SQL projections: `parsed` / `nullable` turn a schema or a column into the decoder drizzle's `.mapWith()` derives a projection's type from, so a `sql` expression selected as a value can no longer declare a type nothing produces.
  - **`sql-rows`** — Parsed raw-SQL row reads: queryRows / executeRows parse every row against a ZodParser and throw a SqlRowError naming the column, the value and its Postgres type OID — closing the pool.query<T>() assertion hole.
  - **`zero`** — Umbrella for the Rocicorp Zero sync-engine infrastructure: shared constants (core), the zero-cache supervised service (cache-service), and the generic client provider + adapter (client). Domain-agnostic — no concrete schema.

<!-- AUTOGENERATED:END -->
