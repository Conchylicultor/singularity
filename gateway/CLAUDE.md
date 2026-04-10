# Gateway

Reverse proxy that multiplexes multiple Singularity app instances (one per agent worktree) behind a single port using subdomain-based routing.

See the top-level [`CLAUDE.md`](../CLAUDE.md) for overall architecture and [`server/CLAUDE.md`](../server/CLAUDE.md) for the backend.

## What It Does

- Listens on `:9000`, routes `<name>.localhost:9000` → that worktree's backend
- Serves each worktree's `web/dist` as static files directly (no backend spawn needed for page loads)
- Lazy-spawns the backend on the first `/api/*` or `/ws/*` request; tears it down after 10 minutes idle
- Allocates backend ports dynamically from a pool (9001–10000); backends read `PORT` from env
- Discovers worktrees from `~/.singularity/worktrees/<name>.json`
- Exposes `/gateway/*` on every host as an API for apps to query gateway state

## Key Design Decisions

- **Subdomain routing, not path-prefix** — each instance thinks it's at `/`, so no base-path rewriting. `*.localhost` resolves natively in Chrome and Firefox
- **Gateway serves statics, backend serves API/WS** — separating the cheap thing (files) from the expensive thing (process) means page loads are instant and backends only exist when needed
- **Gateway owns backend lifecycles** — backends are spawned, supervised, and killed by the gateway. They never know the gateway exists. The convention is `bun src/index.ts` in the `server` directory with `PORT=<allocated>` in env
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

Two fields, both required, both absolute paths. The gateway hardcodes the launch convention (`bun src/index.ts`, `PORT` env var, 15s readiness timeout). No per-worktree overrides in v1.

## File Structure

Flat single-package layout, ~950 lines total:

```
gateway/
├── main.go        # Flags, wiring, signal handling
├── worktree.go    # Worktree state machine (Idle→Starting→Running→Stopping), spawn, lifecycle
├── registry.go    # Map of worktrees, fsnotify file watcher, idle sweeper
├── proxy.go       # http.Handler: routing, static serving, HTTP/WS proxy, /gateway API
└── ports.go       # Port pool (Acquire/Release with net.Listen probe)
```

Logic belongs with the data it operates on: spawn/stop/readiness are methods on `Worktree`, discovery/sweeping are methods on `Registry`, all request handling is in `Proxy.ServeHTTP`.

## Build & Run

```sh
go build -o gateway .
./gateway                           # defaults: :9000, ~/.singularity/worktrees/
./gateway -listen :8080 -idle-timeout 5m -log-level debug
```

## Backend Contract

The gateway expects backends to:

1. Read their port from the `PORT` env var (default `9001` when running standalone)
2. Accept TCP connections on that port when ready (gateway polls with TCP dial)
3. Use relative redirects (gateway does not rewrite `Location` headers)
4. Handle `/api/*` and `/ws/*` routes

The current `server/src/index.ts` hardcodes `port: 9001` — it must be changed to `parseInt(Bun.env.PORT ?? "9001", 10)` for the gateway to work.

## Concurrency Model

Two levels of locking:

- `Registry.mu` (RWMutex) guards the worktree map. Held briefly for lookup/insert/delete. Never held during I/O
- `Worktree.mu` guards per-worktree state. For slow ops (spawn, stop): lock → snapshot → unlock → work → relock → commit

Concurrent cold-start callers share a single in-flight spawn via a `readyCh` channel — second caller blocks until the first finishes, then both proceed or both get the same error.

## Design Docs

Full design rationale, state machine diagrams, edge cases, and implementation history in:

- [`artifacts/research/2026-04-09-gateway-design.md`](../artifacts/research/2026-04-09-gateway-design.md) — v1 (path-prefix, model B)
- [`artifacts/research/2026-04-09-gateway-design-v2.md`](../artifacts/research/2026-04-09-gateway-design-v2.md) — v2 (subdomain, model A, detailed edge cases)
- [`artifacts/research/2026-04-09-gateway-design-v3.md`](../artifacts/research/2026-04-09-gateway-design-v3.md) — v3 (simplified schema and flat layout)
