# Abstractions

A high-level map of the generic systems Singularity is built on. Each item is a building block that is not tied to the agent-manager app and could host other apps on top.

See [`plugins.md`](plugins.md) for the specific plugins used by the agent manager.

## Plugin system

Frontend framework for composing an app out of independent feature modules.

- **Plugin** — self-contained module exporting a `PluginDefinition { id, name, contributions }`.
- **Slot** — typed extension point a plugin declares for others to fill (`defineSlot<P>(id)`).
- **Contribution** — a value another plugin provides to a slot; retrieved with `slot.useContributions()`.
- **Command** — typed request-response action with one handler and many dispatchers (`defineCommand<Args, Ret>`).
- **View factory** — function returning a `{ title, component }` descriptor, used to hand components across plugin boundaries without leaking internals.
- **Plugin provider** — React context that collects contributions from all registered plugins and exposes them to slots.
- **Root slot** — the single entry point (`Core.Root`) the app shell contributes its layout to.

## Server

Shared backend hosting plugin routes in a single Bun process.

- **Server plugin** — declares `httpRoutes`, `wsRoutes`, and `resources` in a flat `ServerPluginDefinition`.
- **HTTP route** — `"METHOD /path"` → handler function; literal and `:param` segments supported.
- **WebSocket route** — `/ws/...` → `{ open, message, close }` handler matching Bun's native interface.
- **Public API (`api.ts`)** — the subset a plugin exports for cross-plugin import; anything under `internal/` is private.

## Live state

Level-triggered server-to-client state synchronization.

- **Resource** — named piece of server state with a loader (`defineResource({ key, mode, loader })`).
- **Push mode** — new value is sent inline on the socket; use for small, same-for-all-subscribers values.
- **Invalidate mode** — only a version stamp is sent; each tab re-fetches via HTTP on its own cadence.
- **Notifications WebSocket** — single `/ws/notifications` socket multiplexes all resource subscriptions.
- **Notifications client** — leader-elected, cross-tab-shared client that owns the socket and writes into TanStack Query.
- **`useResource` hook** — client-side consumer; wraps TanStack Query with automatic reconnect and cross-tab sync.
- **HTTP fallback** — every resource is also reachable at `GET /api/resources/:key/...` for curl, SSR, or WS-down scenarios.
- **Derived resources (`dependsOn`)** — upstream notifications cascade to downstream resources with param mapping and cycle detection.
- **Sub-lifecycle hooks** — `onFirstSubscribe` / `onLastUnsubscribe` fire on global 0↔N refcount transitions per params tuple.
- **Stream** — append-only firehose (terminal output, log tails) delivered on a dedicated WS route; distinct from resources.

## Database

Per-instance Postgres with a declarative schema and content-addressed migrations.

- **Per-instance DB** — each isolated instance selects a database by env var (one DB per worktree in this app).
- **Schema barrel** — each plugin defines its tables in `schema.ts`; a top-level barrel aggregates them for the typed ORM client.
- **Typed client** — Drizzle ORM client typed against the union of all plugin schemas.
- **Migration file** — `YYYYMMDD_HHMMSS_<hash>__<slug>.sql`, generated from schema diffs, committed to git.
- **Migration runner** — applies any un-applied hash at server start; records applied set in `__singularity_migrations`.
- **DB fork** — `pg_dump | pg_restore` snapshot of a source DB; copies both data and the migration-applied set.
- **Postgres view** — derived state computed from base tables; the write surface stays small and everything else is read-through.

## Gateway

Reverse proxy that multiplexes many app instances behind a single port.

- **Subdomain routing** — `<name>.localhost:<port>` picks the instance; each instance thinks it's at `/`.
- **Static serving** — the gateway serves each instance's built frontend directly; no backend spawn needed for page loads.
- **Lazy backend spawn** — the backend process is started on the first `/api/*` or `/ws/*` request and shut down after idle.
- **Port pool** — backends are assigned an ephemeral port from a range and read it from their `PORT` env var.
- **Worktree registry** — file-based inventory (`~/.singularity/worktrees/<name>.json`) discovered via fsnotify.
- **`/gateway/*` API** — reserved path on every host exposing gateway state (e.g. `GET /gateway/worktrees`).
- **WebSocket hijack** — HTTP upgrade proxied through `http.Hijacker` so the backend sees a native WS.

## CLI

Project-level automation exposed as a single binary.

- **Build command** — regenerates migrations, builds frontend and server, registers the instance with the gateway.
- **Check command** — pluggable validation checks (e.g. schema vs committed migrations) runnable individually or in bulk.
- **Push command** — orchestrates commit, fast-forward of the base branch, merge, and push as one flow.

## Isolation primitives

Per-agent sandboxing so many agents can work in parallel without conflict.

- **Worktree** — isolated git working copy with its own branch; each agent gets one.
- **Namespace** — an instance identity shared by a worktree, its DB, its backend process, and its subdomain.
- **Deploy-per-namespace** — every namespace is independently built, served, and addressable at its own URL.

## Config

Per-instance, per-plugin typed configuration with a unified storage and Settings UI.

- **`defineConfig(schema)`** — plugin declares its typed fields; supported kinds: `string`, `number`, `boolean`, `string-list`.
- **`readConfig(descriptor)`** — server-side typed read; merges DB overrides with declared defaults.
- **`useConfigValues(descriptor, pluginId)`** — React hook returning a typed value object, kept in sync via the live-state primitive.
- **Settings UI** — auto-generated panel; plugins contribute their descriptor to a slot and the panel renders a section per plugin.

## Events & triggers

Typed cross-plugin reactions to state changes. See [`events.md`](events.md) for the full mental model.

- **Event** — a named fact a plugin emits when its state transitions (`defineTriggerEvent({ name, filters })`); dual-purpose handle with `.emit(payload)` for the owner and `.where(filter)` for subscribers.
- **Action** — a named typed handler registered at plugin load (`defineAction({ name, config: zodSchema, run })`); returns a callable factory that produces an `ActionRef` for subscription and a `.deleteTargeting({...})` sweeper for cleanup.
- **Source** — what `trigger({ on })` accepts. The bare event is a match-any Source; `.where({...})` refines it. Compound / cron sources slot into the same position without changing the `trigger` API.
- **Trigger** — a persisted row binding a source's filter columns to an action's `{name, config}` (`trigger({ on, do, oneShot? })`). One row per subscription, stored in the event's own per-type table.
- **Dispatcher** — in-process scanner invoked from `event.emit(payload)`; filters with AND-ed null-tolerant predicates, validates each row's `action_config` via the action's zod schema, runs matching handlers in parallel, and deletes `oneShot` rows on success.
- **Preservation policy** — unknown action, config parse failure, and handler throws all log-and-skip without deleting, so drift across deploys is recoverable rather than destructive.
- **Cleanup helpers** — `deleteTrigger(id)` sweeps by row id; `action.deleteTargeting(configMatch)` sweeps by JSONB `@>` containment; FK `ON DELETE CASCADE` on filter columns handles target-deletion automatically.

Related: [`tasks-model.md`](tasks-model.md) documents the status vocabularies that feed the first production events (`tasks.completed`, `conversations.completed`).

## Frontend utilities

Reusable client primitives plugins can rely on.

- **Reconnecting WebSocket** — self-healing WS with backoff, exposed via `useReconnectingWebSocket`.
- **Reconnecting EventSource** — same idea for SSE streams produced outside the server (e.g. gateway logs).
- **Shared WebSocket** — cross-tab singleton socket with leader election via `BroadcastChannel`.
- **`fetchWithRetry`** — HTTP fetch with retry/backoff for transient failures.
- **WS status bus** — pub/sub of current connection status so unrelated UI (toasts, badges) can reflect it.
- **Plugin error boundary** — isolates a crashing contribution so it doesn't take down the whole surface.

## Screenshots & scripted UI checks

Verification primitives for UI work.

- **Static screenshot** — one-shot Playwright capture of a URL.
- **Scripted screenshot** — Playwright helper that performs an interaction and captures before/after plus DOM state.
