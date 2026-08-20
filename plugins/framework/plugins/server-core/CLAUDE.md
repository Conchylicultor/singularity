# Server

Shared backend for Singularity. A single Bun process that routes HTTP requests and WebSocket connections to handlers provided by plugins.

See the top-level [`CLAUDE.md`](../../../../CLAUDE.md) for overall architecture and [`plugins/framework/plugins/web-sdk/CLAUDE.md`](../web-sdk/CLAUDE.md) for the frontend plugin system.

## How It Works

1. `bin/index.ts` starts `Bun.serve({ unix: process.env.SOCKET_PATH })` on the per-worktree Unix socket the gateway hands it (e.g. `~/.singularity/sockets/<name>.sock`). The backend errors out if `SOCKET_PATH` is missing — there is no standalone dev mode.
2. Each plugin declares its routes via a `ServerPluginDefinition` (`core/types.ts`). At startup the entry point flattens them into two lookup tables: `httpRoutes` (`"METHOD /path"` → handler) and `wsRoutes` (`"/path"` → `WsHandler`).
3. Plugins also declare live-state via `resources` (see `defineResource` below). Append-only firehoses (terminal, log tails) use a dedicated WS route. There is no SSE path — raw `text/event-stream` in TS is forbidden (`./singularity check no-raw-sse`).

## ServerPluginDefinition

Each server plugin default-exports a `ServerPluginDefinition`. `id` is not authored — the loader derives it from the plugin's hierarchy path:

```typescript
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

const plugin: ServerPluginDefinition = {
  httpRoutes: { "GET /api/tasks": handleList },
  wsRoutes: { "/ws/terminal": wsHandler },
};
export default plugin;
```

The type is intentionally flat — no base classes. A plugin is a data object with optional route maps and lifecycle hooks. Two readiness hooks: **`onReadyBlocking`** runs as a hard barrier after the socket binds but before the server reports ready (and before any `onReady`) — use only for work that must finish before the backend can correctly serve requests (DB migrations + warmup, registry init); the gateway gates its hot-swap on the barrier completing. **`onReady`** runs after the barrier, so it observes a migrated DB and ready registry — use it for background work like pollers or watchers.

**Barrier fatality is not gated on `loadBearing`.** A throw in *any* plugin's `onReadyBlocking` aborts boot — the barrier's contract is "this completes before we serve", so failing to complete is fatal by definition; gating it on `loadBearing` would promote degraded backends behind a green `/api/health/ready`. If blocking work is genuinely optional-for-correctness (failure should *degrade*, not crash), catch the error **inside** the hook and continue — pattern: `plugins/database/plugins/live-state-snapshot/server/internal/boot-init.ts`. `loadBearing` still gates the post-serving `onReady` / `onAllReady` phases, where killing a live backend is reserved for critical plugins.

### `defineResource` — live state

Live state (anything a client wants kept in sync with server truth) is declared via `defineResource`, never by hand-rolled WS or SSE:

```typescript
// plugins/tasks/server/internal/tasks-resource.ts
import { defineResource } from "@plugins/framework/plugins/server-core/core";

export const tasksResource = defineResource({
  key: "tasks",
  mode: "push",                // or "invalidate"
  loader: async () => loadTasks(),
});
```

Mount via `resources: [tasksResource]` on the `ServerPluginDefinition`. The core auto-registers:

- `GET /api/resources/tasks/...` (HTTP fallback for WS-down / curl / SSR)
- A subscription entry on the shared `GET /ws/notifications` socket

Call `tasksResource.notify()` from mutation handlers / pollers when server state changes.

**`push` vs `invalidate`.** Both deliver level state (never deltas). `push` sends the new value inline over the WS (one computation, N tabs). `invalidate` sends only a version stamp; each observing tab fires its own GET. Use `push` when the value is small (< ~4KB), the same for every subscriber, and almost always observed when notifications fire. Otherwise `invalidate`. See `research/2026-04-15-global-sse-lifecycle-mental-model-v3.md` §5 for the full decision rule.

On the client, plugins consume resources with `useResource` from `@plugins/primitives/plugins/live-state/web` — see `plugins/framework/plugins/web-sdk/CLAUDE.md`. No manual reconnect / reconcile code; TanStack Query + the leader-elected `NotificationsClient` handle it.

**Two-arg form — derive the contract from the client descriptor.** When a resource already has a client `ResourceDescriptor` (it's consumed by `useResource`), prefer `defineResource(descriptor, serverOpts)` over restating `key`/`schema`/`mode`/`keyOf` inline:

```typescript
import { agentLaunchesResource as descriptor } from "../../shared/resources";

export const agentLaunchesResource = defineResource(descriptor, {
  loader: async (_p, ctx) => loadLaunches(ctx?.affectedIds),
  identityTable: "agent_launches",
  // mode/keyOf are NOT restated — they come from the descriptor.
});
```

`key`, `schema`, and keyed-ness (`mode: "keyed"` + `keyOf`) are read from the descriptor; `serverOpts` (`ServerResourceOptions`) carries only the DB half (`loader`, `dependsOn`, `identityTable`, `debounceMs`, `mode` for push-vs-invalidate on a *non*-keyed descriptor). `ServerResourceOptions.mode` excludes `"keyed"`, so keyed-ness can only come from the descriptor — a server that says keyed and a client descriptor missing its `keyOf` can no longer drift. The flat one-arg form stays for resources with no shared descriptor (server-only state), but is **push/invalidate-only**: a keyed resource has no way to share `keyOf` with the client and MUST use the two-arg form. Requires the server to import the descriptor without a plugin cycle — see the keyed-sync section in `plugins/primitives/plugins/live-state/CLAUDE.md`.

### Handlers

`WsHandler` matches Bun's native interface (`open` / `message` / `close`, over `ServerWebSocket<WsData>`). HTTP handlers are plain `(req: Request) => Response | Promise<Response>` — standard Web API types, no wrappers.

**Prefer `implement()` for new handlers.** The endpoints primitive (`@plugins/infra/plugins/endpoints/server`) wraps a plain handler with typed body/query validation, auto-serialization, and `HttpError` short-circuiting. Declare the contract once in `core/endpoints.ts` with `defineEndpoint`; use `[endpoint.route]` as the `httpRoutes` key. See [`plugins/infra/plugins/endpoints/CLAUDE.md`](../../../infra/plugins/endpoints/CLAUDE.md).

## Adding a Plugin's Server Component

Create `plugins/{name}/server/index.ts` default-exporting the `ServerPluginDefinition`, put
the implementations in `server/internal/`, and run `./singularity build` — the registry is
generated, never hand-edited (root `CLAUDE.md` → "Registry exclusivity").

## Path Aliases

`@plugins/*` is declared **once** in the root `tsconfig.base.json` and inherited via
`extends`; it resolves relative to the base file, so the same entry is correct at every depth
and `tsconfig-alias-single-owner` fails any tsconfig that re-adds a local copy. Third-party
server deps (e.g. `bun-pty`) go in the plugin's own `package.json` — no alias needed.

## How requests reach the backend

`/api/*` and `/ws/*` are proxied by the gateway over the per-worktree Unix socket — the backend has no TCP listener at all. Static assets are served by the gateway. See [`gateway/CLAUDE.md`](../../../../gateway/CLAUDE.md) for the full request-routing rules.

## Database

Drizzle ORM + Postgres, one DB per worktree (`SINGULARITY_WORKTREE` env var picks the database name).

- Each plugin defines its tables in `plugins/{name}/server/internal/tables.ts` and any derived views/Zod schemas in `plugins/{name}/server/internal/schema.ts`.
- `plugins/database/plugins/migrations/drizzle.config.ts` discovers plugin schemas via glob (`plugins/**/server/**/internal/{tables,schema}.ts`) — there is **no central aggregator file**. Adding a new plugin's tables requires no edits outside that plugin.
- `@plugins/database/server` exports `db = drizzle(pool)` without a schema object — the codebase uses the SQL builder API (`db.select().from(...)`), not drizzle's relational query API (`db.query.<table>`), so no runtime schema aggregation is needed.
- Migrations live in `plugins/database/plugins/migrations/data/` (committed to git).

### Schema change workflow

Edit `plugins/{name}/server/internal/tables.ts` (or `schema.ts` for views) → run `./singularity build`. The build runs `drizzle-kit generate` (writes a new SQL migration if any plugin schema changed, renamed to `YYYYMMDD_HHMMSS_<hash>__<slug>.sql`) and restarts the server, which applies pending migrations on startup. There is no separate `db:generate` step — always go through `./singularity build`. First build after a schema change requires `--migration-name <slug>`; subsequent builds with no schema change don't.

### Migration runner

`plugins/database/plugins/migrations/server/` runs via the database plugin's `onReadyBlocking` hook on every server start: ensure `__singularity_migrations (hash PRIMARY KEY, file, applied_at)`, read the applied hashes, then run each migration file (sorted by filename timestamp) whose hash is not applied, inserting the hash in the same transaction. An applied hash with no file on disk *warns*, never errors. A DB's applied set is whatever `__singularity_migrations` says it is — never infer applied-ness from anything else (drizzle's legacy `drizzle.__drizzle_migrations`, file presence). No bootstrap, no legacy-drizzle branch, no auto-seeding.

A worktree's DB is a `pg_dump | pg_restore` fork of main (`plugins/database/plugins/fork/`) carrying forward **data** *and* migration state, so a fresh fork no-ops on first start and only migrations committed after the fork timestamp execute in it. Hash-based filenames let parallel agents add migrations without collision; each worktree converges on the same applied *set*, possibly in a different order.

### Gotchas

- **Forks copy data, not just schema.** A migration running *after* a fork sees whatever rows the source DB had at fork time. Drizzle-generated DDL is idempotent, but hand-written DML (seed inserts, backfills) can double-apply — write it idempotent (`INSERT … ON CONFLICT DO NOTHING`, `UPDATE … WHERE` guarded on current state). Data migrations are DML-only, enforced by `./singularity check data-migration-dml-only`.
- **Rebased-away migrations drift silently.** Apply locally, then rebase onto a main that never merged it, and the DB keeps whatever it did. The runner warns (`applied hash X has no matching file on disk`) but does not roll back. Reinstate the file, or drop + refork.
- **Keep migrations additive** — new tables, new columns. Two agents reshaping the same object in order-dependent ways can land in reverse order in one worktree.
- **Don't hand-edit the `YYYYMMDD_HHMMSS_<hash>` prefix** — it determines sort order and the hash is content-addressed.

### Resetting a worktree DB

Do **not** hand-edit `__singularity_migrations` to "fix" drift — drop and re-fork:

```bash
psql -d postgres -c 'DROP DATABASE IF EXISTS "claude-<timestamp>" WITH (FORCE)'
./singularity build    # recreates the worktree DB via fork + migrations
```

The server itself is spawned and supervised by the gateway; never start it manually.

## Key Design Decisions

- **Plugins own their routes** — each plugin declares routes in its `ServerPluginDefinition`, not in a central file
- **No middleware** — plugins own their paths entirely; shared concerns (auth, logging) can be added as utilities later
- **Route matching** — literal paths are matched exactly (O(1) map). Paths with `:param` segments (e.g. `GET /api/conversations/:id`) are matched linearly in registration order; captured params are passed as the second argument to the handler
- **Shared web/server code defaults to `core/`**, not a slot — see [`web-sdk/CLAUDE.md`](../web-sdk/CLAUDE.md) → "Sharing code between web and server"
- **Bun runs TypeScript directly** — no build step needed

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Core:
  - Uses:
    - `framework/resource-runtime.createResourceRuntime`
    - `framework/tooling/collected-dir.defineCollectedDir`
  - Exports (types):
    - `DependsOnEntry`
    - `ExternalResource`
    - `HttpHandler`
    - `LiveStateSnapshotHooks`
    - `LoadedServerPlugin`
    - `LoaderAggregateView`
    - `MemoryCheckpoint`
    - `PhaseId`
    - `ProcMemory`
    - `ProfilerHooks`
    - `RecomputeIntent`
    - `Registration`
    - `ResourceContract`
    - `ResourceDefinition`
    - `ResourceLike`
    - `ResourceMode`
    - `ResourceParams`
    - `ResourcePushObserver`
    - `RuntimeProfileView`
    - `ServerContribution`
    - `ServerContributionToken`
    - `ServerErrorReport`
    - `ServerFatalReport`
    - `ServerPluginDefinition`
    - `ServerResourceOptions`
    - `Span`
    - `WsData`
    - `WsHandler`
  - Exports (values):
    - `applyDbChange`
    - `boundedMembershipKeys`
    - `collectContributions`
    - `defineExternalResource`
    - `defineResource`
    - `defineServerContribution`
    - `getProfilingData`
    - `handleResourceHttp`
    - `isServerReady`
    - `loadResourceByKey`
    - `markServerReady`
    - `measureSubscribeCycle`
    - `notificationsWsHandler`
    - `notifyStatsFor`
    - `onResourcePush`
    - `physFootprintBytes`
    - `procMemory`
    - `profilerStart`
    - `recomputeResource`
    - `recordMemoryCheckpoint`
    - `reportServerError`
    - `reportServerFatalSync`
    - `Resource`
    - `scopedResourceIdentities`
    - `serverCollectedDir`
    - `setErrorReporter`
    - `setFatalReporter`
    - `setFeedExemptTables`
    - `setLiveStateSnapshotHooks`
    - `setProfilerHooks`
    - `setRelationResolver`
    - `triggerResourcePush`
    - `withNotifyBatch`

<!-- AUTOGENERATED:END -->
