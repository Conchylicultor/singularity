# Gateway

Reverse proxy that multiplexes multiple Singularity app instances (one per agent worktree) behind a single port using subdomain-based routing.

See the top-level [`CLAUDE.md`](../CLAUDE.md) for overall architecture and [`server/CLAUDE.md`](../server/CLAUDE.md) for the backend.

## What It Does

- Listens on `:9000`, routes `<name>.localhost:9000` → that worktree's backend
- Serves each worktree's `web/dist` as static files directly (no backend spawn needed for page loads)
- Lazy-spawns the backend on the first `/api/*` or `/ws/*` request; tears it down after 10 minutes idle
- Hands each backend a Unix domain socket at `~/.singularity/sockets/<name>.sock`; backends read `SOCKET_PATH` from env. Gateway dials the socket directly — no TCP between gateway and backend.
- Discovers worktrees from `~/.singularity/worktrees/<name>.json`
- Exposes `/gateway/*` on every host as an API for apps to query gateway state
- **Supervises the embedded Postgres cluster** (one daemon per host, shared by every worktree). See "Postgres supervision" below.

## Key Design Decisions

- **Subdomain routing, not path-prefix** — each instance thinks it's at `/`, so no base-path rewriting. `*.localhost` resolves natively in Chrome and Firefox
- **Gateway serves statics, backend serves API/WS** — separating the cheap thing (files) from the expensive thing (process) means page loads are instant and backends only exist when needed
- **Gateway owns backend lifecycles** — backends are spawned, supervised, and killed by the gateway. They never know the gateway exists. The convention is `bun src/index.ts` in the `server` directory with `SOCKET_PATH=<path>` in env
- **Unix domain sockets, not TCP loopback** — eliminates the IPv4/IPv6 bind-shape asymmetry that allowed unrelated processes to silently steal traffic on macOS (an IPv4-loopback squatter could coexist with a dual-stack listener on the same port). UDS scopes the gateway↔backend channel by filesystem path, removes the port allocator entirely, and removes any LAN-exposure surface.
- **`/gateway/*` is a reserved path** on every host — the gateway intercepts it before proxying. Apps call `GET /gateway/worktrees` to list instances. This is an official API, not internal plumbing

## Routing Rules

```
/gateway/*       → gateway's own API (intercepted before proxying)
/api/*           → proxy to backend (lazy-spawn if needed)
/ws/*            → proxy to backend (WebSocket upgrade via http.Hijacker)
everything else  → static file from web/dist (SPA fallback for extensionless paths)
```

`/api/*` and `/ws/*` are the same prefixes as the Vite dev proxy in `web/vite.config.ts`.

## Worktree Registry

Location: `~/.singularity/worktrees/<name>.json`. Filename = worktree identifier = subdomain.

```json
{
  "server": "/absolute/path/to/server",
  "web": "/absolute/path/to/web/dist"
}
```

Two fields, both required, both absolute paths. The gateway hardcodes the launch convention (`bun src/index.ts`, `SOCKET_PATH` env var, 15s readiness timeout). No per-worktree overrides in v1.

## File Structure

Flat single-package layout:

```
gateway/
├── main.go        # Flags, wiring, signal handling, sockets-dir setup, PG bring-up
├── worktree.go    # Worktree state machine (Idle→Starting→Running→Stopping), spawn, lifecycle
├── registry.go    # Map of worktrees, fsnotify file watcher, idle sweeper, stale-socket sweep
├── postgres.go    # Embedded Postgres supervisor: initdb, pg_ctl, watchdog, status
└── proxy.go       # http.Handler: routing, static serving, HTTP/WS proxy, /gateway API
```

Logic belongs with the data it operates on: spawn/stop/readiness are methods on `Worktree`, discovery/sweeping are methods on `Registry`, all request handling is in `Proxy.ServeHTTP`, PG lifecycle is on `PgSupervisor`.

## Postgres supervision

The embedded Postgres cluster is a host-level singleton, owned by the gateway. Bootstrap order on a cold gateway start:

1. HTTP server binds (`:9000`) — `/api/database/status` immediately answers `{"pg":"stopped"}` while PG comes up.
2. `PgSupervisor.Start(ctx)` runs synchronously in main:
   - Resolves the platform's `embedded-postgres` binary dir under `<repoRoot>/plugins/infra/plugins/database/node_modules/@embedded-postgres/<plat>/native/bin/` (`-repo-root` flag).
   - Recreates the dylib alias symlinks listed in `pg-symlinks.json` (npm doesn't preserve symlinks).
   - If `~/.singularity/postgres/data-pg18/postmaster.pid` exists and the socket dials, reattaches without spawning (PG outlived a prior gateway instance).
   - Otherwise: `initdb` if needed, then `pg_ctl start -w` which daemonizes PG and exits.
   - Arms a 2s watchdog that dials the PG socket; on failure, attempts one re-spawn; if that also fails, marks state Crashed and stops watching.
3. `central` worktree is eagerly spawned in a goroutine — by this point PG is ready, so central plugins can connect immediately.

PG runs entirely outside the gateway's process group (orphan reparented to init). Killing the gateway leaves PG alive — `./singularity start --force` rebuilds and relaunches the gateway, but worktree backends keep their pools open across the gateway blip.

`SINGULARITY_USE_SYSTEM_PG=1` skips the supervisor entirely; `/api/database/status` returns `{"pg":"running","useSystemPg":true}` and the gateway never touches `pg_ctl`.

`/api/database/status` is intercepted in `proxy.ServeHTTP` *before* the central-routes lookup, so the gateway's answer is authoritative even if a stale `central-routes.json` still lists it.

## Build & Run

```sh
go build -o gateway .
./gateway                           # defaults: :9000, ~/.singularity/worktrees/
./gateway -listen :8080 -idle-timeout 5m -log-level debug
```

## Backend Contract

The gateway expects backends to:

1. Read their socket path from the `SOCKET_PATH` env var (required; backends should error out if missing)
2. Bind that Unix socket and accept HTTP/1.1 + WebSocket connections on it (gateway polls readiness with `net.Dial("unix", path)`)
3. Use relative redirects (gateway does not rewrite `Location` headers)
4. Handle `/api/*` and `/ws/*` routes

In Bun: `Bun.serve({ unix: process.env.SOCKET_PATH, fetch, websocket })`. There is no standalone dev mode — the backend is always spawned by the gateway.

## Stale-socket cleanup

Two layers, both gateway-side:

1. **Per-spawn unlink-before-bind** — `os.Remove(socketPath)` immediately before each spawn. Handles the case where a previous process crashed and left a socket file behind.
2. **Boot sweep** — at gateway startup, any `*.sock` file under `~/.singularity/sockets/` whose stem isn't a registered worktree gets removed. Cosmetic; prevents accumulation when worktrees are deleted while their socket lingers.

## Path-length limit

macOS `sun_path` is 104 bytes. With the standard prefix (`/Users/<user>/.singularity/sockets/`) and `.sock` suffix, worktree names up to ~67 chars fit. If a worktree's name produces an overlong path, `NewWorktree` returns an error and the worktree is rejected at registration. Rename or shorten the worktree to recover.

## File permissions

`Bun.serve({ unix })` creates the socket with umask-derived default permissions (typically world-readable). On a single-user dev machine this is acceptable. If multi-user use becomes a requirement, this is the right place to revisit (Bun does not currently expose a `mode` option; see also `chmod`-after-bind, which is racy).

## Concurrency Model

Two levels of locking:

- `Registry.mu` (RWMutex) guards the worktree map. Held briefly for lookup/insert/delete. Never held during I/O
- `Worktree.mu` guards per-worktree state. For slow ops (spawn, stop): lock → snapshot → unlock → work → relock → commit

Concurrent cold-start callers share a single in-flight spawn via a `readyCh` channel — second caller blocks until the first finishes, then both proceed or both get the same error.

## Design Docs

Full design rationale, state machine diagrams, edge cases, and implementation history in:

- [`research/2026-04-09-gateway-design.md`](../research/2026-04-09-gateway-design.md) — v1 (path-prefix, model B)
- [`research/2026-04-09-gateway-design-v2.md`](../research/2026-04-09-gateway-design-v2.md) — v2 (subdomain, model A, detailed edge cases)
- [`research/2026-04-09-gateway-design-v3.md`](../research/2026-04-09-gateway-design-v3.md) — v3 (simplified schema and flat layout)
