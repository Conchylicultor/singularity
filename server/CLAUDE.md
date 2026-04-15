# Server

Shared backend for Singularity. A single Bun process that routes HTTP requests and WebSocket connections to handlers provided by plugins.

See the top-level [`CLAUDE.md`](../CLAUDE.md) for overall architecture and [`plugin-core/CLAUDE.md`](../plugin-core/CLAUDE.md) for the frontend plugin system.

## How It Works

1. `src/index.ts` starts `Bun.serve()` on port 9001
2. Each plugin declares its routes via a `ServerPluginDefinition` (defined in `src/types.ts`)
3. `src/plugins.ts` is a flat list of plugin imports — structurally identical to `web/src/plugins.ts`
4. At startup, the entry point flattens all plugin routes into three lookup tables:
   - `httpRoutes` — `"METHOD /path"` → handler function
   - `wsRoutes` — `"/path"` → `WsHandler` object (open/message/close)
   - `sseRoutes` — `"/path"` → `SseHandler` object (subscribe returning unsubscribe). Exposed to clients via a single multiplexed `GET /api/events?urls=…` stream owned by the core; plugins never write `text/event-stream` themselves

## File Structure

```
server/
├── package.json          # @singularity/server
├── tsconfig.json
└── src/
    ├── index.ts          # Bun.serve entry — collects routes from plugins
    ├── plugins.ts        # Plugin registry (list of imports)
    └── types.ts          # ServerPluginDefinition, WsHandler, HttpHandler
```

## ServerPluginDefinition

Each server plugin default-exports a `ServerPluginDefinition`:

```typescript
import type { ServerPluginDefinition } from "../../../server/src/types";
import { wsHandler } from "./internal/ws-handler";

const plugin: ServerPluginDefinition = {
  id: "terminal",
  name: "Terminal",
  wsRoutes: {
    "/ws/terminal": wsHandler,
  },
};
export default plugin;
```

The type is intentionally flat — no base classes, no lifecycle hooks. A plugin is just a data object with optional route maps.

### SseHandler Interface

SSE streams are declared as pure subscriber handlers:

```typescript
interface SseHandler {
  subscribe(
    send: (data: unknown) => void,
    params: Record<string, string>,
  ): (() => void) | Promise<() => void>;
}
```

All streams are multiplexed onto the single core endpoint `GET /api/events?urls=<csv>`; each emitted value is wrapped as a named SSE event keyed by the virtual URL. The core owns response encoding and a 20s heartbeat. Plugins just push payloads via `send(...)` and return a teardown. `:param` path segments are supported, same syntax as `httpRoutes`.

### WsHandler Interface

WebSocket handlers match Bun's native interface:

```typescript
interface WsHandler {
  open(ws: ServerWebSocket<WsData>): void;
  message(ws: ServerWebSocket<WsData>, msg: string | Buffer): void;
  close(ws: ServerWebSocket<WsData>, code: number, reason: string): void;
}
```

### HTTP Handlers

Plain functions: `(req: Request) => Response | Promise<Response>`. No wrapper types needed — these are standard Web API types.

## Adding a Plugin's Server Component

1. Create the plugin directory with this structure:

```
plugins/{name}/server/
  index.ts        # Default export: ServerPluginDefinition (routes declared here)
  api.ts          # Optional: public API for other plugins to import
  internal/       # Handler implementations, business logic (never imported externally)
```

2. Declare routes in `index.ts`:

```typescript
import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleList } from "./internal/handle-list";

const plugin: ServerPluginDefinition = {
  id: "tasks",
  name: "Tasks",
  httpRoutes: {
    "GET /api/tasks": handleList,
  },
};
export default plugin;
```

3. Register in `server/src/plugins.ts`:

```typescript
import tasksPlugin from "@plugins/tasks/server";

export const plugins: ServerPluginDefinition[] = [
  // ...existing plugins
  tasksPlugin,
];
```

That's it. No base class, no setup function, no registration ceremony.

## Path Aliases

Configured in `tsconfig.json`:

- `@plugins/*` → `../plugins/*/`

The `include` field covers `../plugins/*/server` and `../plugins/*/shared` so plugin server code and shared types are type-checked together with the server.

Server-side plugin dependencies (like `bun-pty`) are declared in the plugin's own `package.json` and resolved via bun workspaces. No path aliases are needed for third-party packages.

## Dev Proxy

The Vite dev server (`web/vite.config.ts`) proxies to the backend:

- `/ws/*` → `ws://localhost:9001` (WebSocket)
- `/api/*` → `http://localhost:9001` (HTTP)

In production, a reverse proxy or the backend itself serves the static frontend.

## Database

Drizzle ORM + Postgres, one DB per worktree (`SINGULARITY_WORKTREE` env var picks the database name).

- Each plugin defines its tables in `plugins/{name}/server/schema.ts`.
- `server/src/db/schema.ts` is a typed barrel: one `export * from "@plugins/{name}/server/schema"` line per plugin with tables.
- `server/src/db/client.ts` exports a typed `db` aggregating all plugin schemas.
- Migrations live in `server/src/db/migrations/` (committed to git).

### Schema change workflow

Edit `schema.ts` → run `./singularity build`. The build runs `drizzle-kit generate` (writes a new SQL migration if the schema changed, renamed to `YYYYMMDD_HHMMSS_<hash>__<slug>.sql`) and restarts the server, which applies pending migrations on startup. There is no separate `db:generate` step — always go through `./singularity build`. First build after a schema change requires `--migration-name <slug>`; subsequent builds with no schema change don't.

### Migration runner

`server/src/db/migrate.ts` runs on every server start. The algorithm is deliberately simple:

1. Ensure `__singularity_migrations (hash PRIMARY KEY, file, applied_at)` exists.
2. Read applied hashes from that table.
3. Warn (don't error) on any applied hash with no corresponding file on disk — this means a migration was rebased away after running, and the DB has silently drifted.
4. Loop over migration files sorted by filename timestamp; for each whose hash is not applied, run its SQL and insert the hash in a single transaction.

No bootstrap, no legacy-drizzle branch, no auto-seeding. A DB's applied set is whatever `__singularity_migrations` says it is.

### Worktree DB lifecycle

- On worktree creation, `plugins/conversations/server/internal/db-fork.ts` forks the main `singularity` DB via `pg_dump | pg_restore`. The fork carries forward both **data** and **migration state** (`__singularity_migrations` is a regular public table, so it's copied).
- Fresh forks therefore start with every main-applied hash already recorded — the runner no-ops on first start. Only migrations committed to git *after* the fork timestamp will actually execute in the worktree.
- Forks defensively `DROP SCHEMA IF EXISTS drizzle CASCADE` to strip any remnants of the pre-hash migration system.

### Sync / rebase / multi-build behavior

The runner is safe across the workflows agents actually use:

- **Multiple builds without schema change** — no-op; all hashes already applied.
- **Pull new migrations from main, then build** — loop picks up un-applied hashes and runs them.
- **Parallel agents merging migrations** — hash-based filenames means two agents can add migrations in parallel without filename collision. After merge, each worktree applies whichever hashes are new to it. Application order within a given DB may differ from a fresh DB, but the applied *set* converges. This only matters for non-commutative migrations.
- **Generate locally, then rebase, then build** — local hash is already applied in the worktree DB; rebased-in hashes are not. Next build applies only the latter.

### Gotchas

- **Forks copy data, not just schema.** A migration that runs *after* a fork sees whatever rows the source DB had at fork time. Drizzle-generated DDL is idempotent (`CREATE TABLE IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object`), but hand-written data migrations (seed inserts, backfills) can double-apply relative to forked data. Prefer idempotent statements (`INSERT … ON CONFLICT DO NOTHING`, `UPDATE … WHERE …` guarded on current state) for any DML migration.
- **Rebased-away migrations drift silently.** If you apply a migration locally, then rebase onto a main where it was never merged, the DB keeps whatever it did. The runner logs a warning on next start (`applied hash X has no matching file on disk`) but does not roll back. If this happens, either reinstate the file or drop + refork the worktree DB.
- **Non-commutative migrations under parallel merges.** If two agents ship migrations that touch the same object in order-dependent ways, one worktree may apply them in the reverse order of a fresh fork. Avoid this by keeping migrations additive — new tables, new columns — rather than reshaping shared objects in parallel branches.
- **Ordering within a single build is by filename timestamp.** `YYYYMMDD_HHMMSS_<hash>` prefixes determine sort order; the hash is content-addressed and stable. Don't hand-edit prefixes or hashes.
- **DB state is the source of truth for "applied".** Don't try to infer applied-ness from anything else (drizzle's legacy `drizzle.__drizzle_migrations` table, file presence, etc.). Those are ignored.

### Resetting a worktree DB

If a worktree's DB is in a bad state, the cheapest fix is to drop and re-fork:

```bash
psql -d postgres -c 'DROP DATABASE IF EXISTS "claude-<timestamp>" WITH (FORCE)'
./singularity build    # recreates the worktree DB via fork + migrations
```

Do **not** manually edit `__singularity_migrations` to "fix" drift — re-fork instead.

## Commands

The server is spawned and supervised by the gateway (`bun src/index.ts` with `PORT=<allocated>`); never start it manually. Always go through `./singularity build` from the repo root to deploy changes.

## Key Design Decisions

- **Plugins own their routes** — each plugin declares routes in its `ServerPluginDefinition`, not in a central file
- **No middleware** — plugins own their paths entirely; shared concerns (auth, logging) can be added as utilities later
- **Route matching** — literal paths are matched exactly (O(1) map). Paths with `:param` segments (e.g. `GET /api/conversations/:id`) are matched linearly in registration order; captured params are passed as the second argument to the handler
- **Internal/public separation** — `index.ts` and `api.ts` are public; `internal/` is never imported by other plugins
- **Plugin dependencies go in their own `package.json`** — resolved via bun workspaces
- **Bun runs TypeScript directly** — no build step needed
