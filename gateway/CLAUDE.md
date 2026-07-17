# Gateway

Reverse proxy that multiplexes multiple Singularity app instances (one per agent worktree) behind a single port using subdomain-based routing.

See the top-level [`CLAUDE.md`](../CLAUDE.md) for overall architecture and [`server/CLAUDE.md`](../server/CLAUDE.md) for the backend.

## What It Does

- Listens on `:9000`, routes `<name>.localhost:9000` → that worktree's backend
- Serves each worktree's `web/dist` as static files directly (no backend spawn needed for page loads)
- Lazy-spawns the backend on the first `/api/*` or `/ws/*` request; tears it down after 10 minutes idle
- Hands each backend a Unix domain socket at `~/.singularity/sockets/<name>.sock`; backends read `SOCKET_PATH` from env. Gateway dials the socket directly — no TCP between gateway and backend.
- Discovers worktrees from `~/.singularity/worktrees/<name>/spec.json`
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

Location: `~/.singularity/worktrees/<name>/spec.json`. Directory name = worktree identifier = subdomain.

```json
{
  "server": "/absolute/path/to/server",
  "web": "/absolute/path/to/web/dist"
}
```

Two fields, both required, both absolute paths. The gateway hardcodes the launch convention (`bun bin/index.ts`, `SOCKET_PATH` env var, escalating readiness timeout — see "Backend Contract"). No per-worktree overrides in v1. Other per-worktree files (build logs, profiling data) also live in the same subdirectory.

Composition namespaces (`http://<composition>.localhost:9000`, the build CLI's compose-serve stage) are ordinary spec dirs written by the build — `server` points at main's checkout, `web` at a composed dist, plus a `composition.json` provenance marker the gateway ignores. No gateway changes; namespace identity flows the same way (dir name → `SINGULARITY_WORKTREE`).

### Discovery: dir-level watch + lazy resolve + periodic reconcile

Registration is decoupled from fsnotify so it cannot silently fail at scale. Three layers (`registry.go`):

1. **Single dir-level fsnotify watch** on the registry dir (1 FD). Catches subdir create/remove for low latency. It does **NOT** add a watch per worktree subdir — with thousands of worktree dirs that exhausts the macOS kqueue/open-file budget, and a dropped per-subdir `w.Add` loses the worktree forever (the build creates the subdir early for logs, then writes `spec.json` last, so the later write is the event that goes unobserved). That was the prior silent-failure bug.

   **Only the `<name>/spec.json` subdir layout is recognized.** The old flat `<name>.json` spec layout (written by pre-May-2026 CLI versions) has been **retired** from all scan paths (`LoadAll`, `Watch`, `Reconcile`). `Resolve` (the request path) was always subdir-only, so a flat-only spec was already unroutable — nothing relied on the flat scan. Retiring it also stops the gateway from re-parsing the unrelated `*-build-profile.json` / `*-build-logs.json` profiling artifacts that share the registry dir as if they were specs (they have no `server` field), which previously emitted ~1.3k `failed to load legacy spec` warnings on every boot/reconcile. `removeWorktreeSpec` still deletes any leftover flat `<name>.json` defensively.
2. **Lazy `Registry.Resolve(name)`** on the request path (`proxy.go`). If a host has no registered worktree but `<name>/spec.json` exists on disk, it is loaded and registered on demand — so any worktree whose spec is on disk is reachable on its **first request**, regardless of watch health.
3. **Periodic `Registry.Reconcile`** (`-reconcile-interval`, default 10s) re-scans the dir as a backstop: registers any `spec.json` the watch missed (keeping `GET /gateway/worktrees` eventually-consistent) and unregisters worktrees whose backing dir vanished (e.g. removed by `worktree-cleanup`). This is the watch+reconcile informer pattern; reconcile skips already-registered dirs so it stays cheap even with thousands.

Net effect: `spec.json` on disk ⟺ worktree reachable. The watch is a latency optimization, never a correctness dependency.

### Self-healing stale registrations (dead `spec.Server`)

The registry subdir (`~/.singularity/worktrees/<name>/`, holding `spec.json` + logs) is a *different* path from `spec.Server` (the git worktree's server dir, e.g. `<repo>/.claude/worktrees/<name>/plugins/.../server-core`). The subdir can outlive the worktree it points at — `worktree-cleanup` or a manual `git worktree remove` can delete the git worktree while leaving the registry subdir behind. Such a registration is born-dead: it can only ever fail to spawn (`cmd.Dir = spec.Server` does not exist).

`registry.go` evicts these defensively (`serverPathMissing`, ENOENT-only so a transient stat error never evicts a live worktree):

- `loadFile`/`loadLegacyFile` refuse to register a spec whose `spec.Server` is already gone — so boot `LoadAll`, lazy `Resolve`, and the watch never admit a dead entry.
- `reconcileOnce` also unregisters a *previously-registered* worktree once its `spec.Server` disappears (the registry-subdir presence check alone never fires, because that subdir is still on disk).

The gateway never deletes the on-disk registry subdir itself (that is `worktree-cleanup`'s job) — it only keeps `byName` honest.

## File Structure

Flat single-package layout:

```
gateway/
├── main.go        # Flags, wiring, signal handling, sockets-dir setup, service bring-up
├── worktree.go    # Worktree state machine (Idle→Starting→Running→Restarting→Stopping), spawn, lifecycle
├── registry.go    # Map of worktrees: dir-level fsnotify watch + lazy Resolve + periodic Reconcile, idle sweeper, stale-socket sweep
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

## Logging

Each channel gets its own size-rotated file under `-log-dir` (default `~/.singularity/logs/`), so one channel's volume can't bury another:

- `gateway.log` — the gateway's own `slog` output (lifecycle, routing, supervisor). Written directly by the Go process via a rotating writer.
- `<name>.log` — one file per worktree, holding that backend's stdout/stderr (`central.log`, `<worktree>.log`, …). Each line is `<RFC3339> [stdout|stderr] <line>`. Backend output never lands in `gateway.log`. This is the durable counterpart to the in-memory `logRing` that feeds the live UI.
- `gateway-stdio.log` — the daemon's raw stdout/stderr (Go panics, any crash before `slog` is wired up). Owned by the launcher (`./singularity start`), truncated on each start.

Rotation (`logwriter.go`, `rotatingWriter`) is size-based: at `maxLogBytes` (50 MB) the active file becomes `<file>.1`, older backups shift up, and the oldest past `maxLogBackups` (5) is dropped — so each channel is capped at ~300 MB with no external dependency. The per-worktree writer opens lazily and is closed when the worktree is unregistered.

## Build & Run

```sh
go build -o gateway .
./gateway                           # defaults: :9000, ~/.singularity/worktrees/
./gateway -listen :8080 -idle-timeout 5m -log-level debug
```

## Backend Contract

The gateway expects backends to:

1. Read their socket path from the `SOCKET_PATH` env var (required; backends should error out if missing)
2. Bind that Unix socket and accept HTTP/1.1 + WebSocket connections on it. The gateway polls readiness via `GET /api/health/ready` over the socket — it hot-swaps only once that returns `200` (backend fully ready: migrations applied, DB warm, registry built), not on a bare socket accept. A `404` (backend predates the readiness endpoint) falls back to "HTTP-reachable = ready"; `503` means still booting.

   **Wedge detection is progress-aware and escalates before it kills.** The base deadline (`-ready-timeout`, load-adaptive up to `-ready-timeout-max`) is only the wedge *threshold*: when it expires but the backend has answered HTTP at all (even `503`), or was spawned darwinbg-demoted (an E-core boot legitimately exceeds base under host load — even to first socket bind), the gateway lifts the demotion (`taskpolicy -B`) and extends the wait by `-ready-timeout-max` instead of SIGKILLing near-complete boot work. Only a silent, never-demoted backend is declared wedged at base; a crashed backend is always caught instantly via its exit channel. This closes the 2026-07-07 spawn-kill loop, where healthy demoted boots were killed at 15s four times in a row under load, turning a slow cold start into a ~2-minute outage.
3. Use relative redirects (gateway does not rewrite `Location` headers)
4. Handle `/api/*` and `/ws/*` routes

In Bun: `Bun.serve({ unix: process.env.SOCKET_PATH, fetch, websocket })`. There is no standalone dev mode — the backend is always spawned by the gateway.

## Orphan-backend reaping & stale-socket cleanup

The gateway owns backend lifecycles, but tracks live backends only in memory — so a gateway crash/restart (or `./singularity start` re-launch) could leave the previous generation's backends orphaned. Cleanup has three layers:

1. **Durable pid sidecar** — at spawn, `startBackend` writes `<socket>.pid` (JSON: `pid`, `pgid`, `wallStart`, `worktree`) next to the socket, atomically (temp + rename). It is removed with the socket everywhere via `removeBackendArtifacts(socketPath)` (socket-first, then sidecar). This makes the gateway's ownership of a backend survive its own restart.
2. **Per-spawn unlink-before-bind** — `removeBackendArtifacts(socketPath)` immediately before each spawn, clearing any socket + sidecar a crashed predecessor left on that path.
3. **Boot reconcile** (`reconcileOrphanBackends`, replaces the old name-based `sweepStaleSockets`) — runs once at startup, **before** any backend is spawned, so the gateway owns zero backends and *any* process still bound to a worktree socket is an orphan from a prior generation. Per socket: a bare `net.Dial` is the liveness gate (a wedged-but-bound backend still completes the connect — reap it). **Not live** → remove socket + sidecar (covers registered worktrees too — this is what fixes a lingering `<name>.next.sock` with no live process). **Live + sidecar** → kill the recorded process group (SIGTERM → grace → SIGKILL, ESRCH-tolerant), then remove. **Live + no sidecar** (legacy backend) → log loudly and leave it.

This boot reconcile is the authoritative path and must stay before the watcher/sweep/eager-central goroutines in `main.go` (the "zero backends yet" invariant). It is **boot-only** — a periodic reconcile would risk killing the gateway's own live backends and is unnecessary, since intra-generation teardown is handled by `drainAndStop`/`Stop`.

The backend's own ppid-poll escape hatch (`server-core/bin/index.ts` — self-exit when reparented to PID 1) is kept as complementary defense-in-depth: it reaps the one case the dir-scan reconcile cannot see — a live backend whose socket file was already unlinked by a later cold-start — and orphans left while the gateway stays down.

## Path-length limit

macOS `sun_path` is 104 bytes. With the standard prefix (`/Users/<user>/.singularity/sockets/`) and `.next.sock` suffix (the longer of the two per-worktree sockets), worktree names up to ~62 chars fit. If a worktree's name produces an overlong path, `NewWorktree` returns an error and the worktree is rejected at registration. Rename or shorten the worktree to recover.

This ~62-char budget applies to the dev `~/.singularity/sockets/` prefix. A packaged release stages its data root at a deep versioned path (`releases/<wt>/<comp>-<target>/<run-id>/data`) that would blow the cap, so `launch.ts` reroots the sockets dir to a short `/tmp` path via `SINGULARITY_SOCKETS_DIR` (the env override read by `-sockets-dir`'s default) — a deep release data root therefore does not constrain worktree names. The dev limit itself is unchanged.

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
