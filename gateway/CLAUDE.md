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
- **Supervises configured services** (e.g. embedded Postgres) via a generic process supervisor. See "Service supervision" below.

## Key Design Decisions

- **Subdomain routing, not path-prefix** — each instance thinks it's at `/`, so no base-path rewriting. `*.localhost` resolves natively in Chrome and Firefox
- **Gateway serves statics, backend serves API/WS** — separating the cheap thing (files) from the expensive thing (process) means page loads are instant and backends only exist when needed
- **Gateway owns backend lifecycles** — backends are spawned, supervised, and killed by the gateway. They never know the gateway exists. The convention is `bun bin/index.ts` in the `server` directory with `SOCKET_PATH=<path>` in env
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

Two fields, both required, both absolute paths. The gateway hardcodes the launch convention (`bun bin/index.ts`, `SOCKET_PATH` env var, 15s readiness timeout). No per-worktree overrides in v1.

## File Structure

Flat single-package layout:

```
gateway/
├── main.go        # Flags, wiring, signal handling, sockets-dir setup, service bring-up
├── worktree.go    # Worktree state machine (Idle→Starting→Running→Restarting→Stopping), spawn, lifecycle
├── registry.go    # Map of worktrees, fsnotify file watcher, idle sweeper, stale-socket sweep
├── supervisor.go  # Generic service supervisor: start commands, readiness probes, watchdog
└── proxy.go       # http.Handler: routing, static serving, HTTP/WS proxy, /gateway API
```

Logic belongs with the data it operates on: spawn/stop/readiness are methods on `Worktree`, discovery/sweeping are methods on `Registry`, all request handling is in `Proxy.ServeHTTP`, service lifecycle is on `Supervisor`.

## Zero-downtime restart

`POST /gateway/worktrees/<name>/restart` performs a hot restart when the backend is already running. The gateway spawns a new backend on an alternate socket (`<name>.next.sock`) while the old one keeps serving. Once the new backend is ready, the proxy pointer is swapped atomically — new requests go to the new process, in-flight requests and WebSocket connections finish on the old one. The old backend then drains and exits.

Two socket paths per worktree: `<name>.sock` (primary) and `<name>.next.sock` (secondary). They alternate on each restart — the gateway always spawns on whichever socket the current backend is NOT using. The `backend` struct groups per-process state (cmd, exitCh, proxy, socket path, WS conn count) so two backends can coexist briefly during the swap window.

If the new backend fails to start (bad code, broken migration), the old backend stays up and the restart returns an error. Failed deploys cause zero downtime.

State machine during restart: `Running → Restarting → Running`. During `Restarting`, `Ensure()` returns the old proxy immediately (no blocking, no 502). The idle sweeper skips worktrees in `Restarting` state. `Stop()` waits for an in-flight restart to settle before proceeding.

## Service supervision

The gateway includes a generic service supervisor (`supervisor.go`) that manages long-lived daemons defined in `~/.singularity/database.json`. The gateway knows nothing about what services are — it just executes start commands, probes readiness, and runs watchdogs.

### Config file: `~/.singularity/database.json`

Auto-generated on first `./singularity start`. Contains two sections:
- `connection` — database host/port/user, read by the server and CLI (not by the gateway)
- `services` — array of processes the gateway should supervise

Each service has a `start` command (executed synchronously), a `ready` probe (`{"unix": "<path>"}` or `{"tcp": "<host:port>"}`), and an optional `watchdog` interval.

### Bootstrap order on a cold gateway start:

1. `Supervisor.StartAll(ctx)` runs synchronously in main — for each service, executes the start command, waits for the readiness probe to succeed, then arms the watchdog goroutine.
2. `central` worktree is eagerly spawned in a goroutine — by this point services are ready, so central plugins can connect immediately.

### Watchdog

Each service's watchdog dials its readiness probe every N seconds (default 2). On failure, attempts one re-execution of the start command. If that also fails, marks the service Crashed and stops watching.

### API

- `GET /gateway/services` — JSON array of all services with their states
- `GET /gateway/services/<name>/status` — JSON object for one service

If `database.json` is missing or has an empty `services` array, the supervisor does nothing (equivalent to using an externally managed database).

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
2. **Boot sweep** — at gateway startup, any `*.sock` or `*.next.sock` file under `~/.singularity/sockets/` whose worktree name isn't registered gets removed. Cosmetic; prevents accumulation when worktrees are deleted while their socket lingers.

## Path-length limit

macOS `sun_path` is 104 bytes. With the standard prefix (`/Users/<user>/.singularity/sockets/`) and `.next.sock` suffix (the longer of the two per-worktree sockets), worktree names up to ~62 chars fit. If a worktree's name produces an overlong path, `NewWorktree` returns an error and the worktree is rejected at registration. Rename or shorten the worktree to recover.

## File permissions

`Bun.serve({ unix })` creates the socket with umask-derived default permissions (typically world-readable). On a single-user dev machine this is acceptable. If multi-user use becomes a requirement, this is the right place to revisit (Bun does not currently expose a `mode` option; see also `chmod`-after-bind, which is racy).

## Concurrency Model

Two levels of locking:

- `Registry.mu` (RWMutex) guards the worktree map. Held briefly for lookup/insert/delete. Never held during I/O
- `Worktree.mu` guards per-worktree state. For slow ops (spawn, stop): lock → snapshot → unlock → work → relock → commit

Concurrent cold-start callers share a single in-flight spawn via a `readyCh` channel — second caller blocks until the first finishes, then both proceed or both get the same error. Concurrent `Restart()` calls are serialized by a separate `restartMu`; `restartDone` lets `Stop()` wait for an in-flight restart without holding the main mutex.

## Design Docs

Full design rationale, state machine diagrams, edge cases, and implementation history in:

- [`research/2026-04-09-gateway-design.md`](../research/2026-04-09-gateway-design.md) — v1 (path-prefix, model B)
- [`research/2026-04-09-gateway-design-v2.md`](../research/2026-04-09-gateway-design-v2.md) — v2 (subdomain, model A, detailed edge cases)
- [`research/2026-04-09-gateway-design-v3.md`](../research/2026-04-09-gateway-design-v3.md) — v3 (simplified schema and flat layout)
