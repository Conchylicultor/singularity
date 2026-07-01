# Load-adaptive boot readiness: stop reaping healthy backends under host load

## Problem

Under high host contention (many concurrent worktree builds, load average ~40+), a
backend boots correctly but binds its socket / completes its readiness barrier a few
seconds past the fixed probe windows. Two independent, fixed, too-short timeouts then
misfire:

1. **CLI `probeHealth`** (`plugins/framework/plugins/cli/bin/commands/build.ts`) — a
   fixed **10s** wall-clock deadline against `GET /api/health`. `retryUntil` checks the
   deadline *before* each attempt, and while the socket is unbound `fetch` fast-fails
   with `ECONNREFUSED` every 250ms. When the backend finally binds (~12s), the next
   attempt's pre-check has already crossed 10s → `onDeadline` fires → `process.exit(1)`
   with the misleading message **"The build artifacts are valid but the server can't
   boot. Check server logs."** — even though the server booted cleanly.

2. **Gateway `waitReady`** (`gateway/worktree.go`) — a fixed **15s** timeout (`-ready-timeout`,
   `main.go:39`) against `GET /api/health/ready` (which only flips 200 *after* the full
   `onReadyBlocking` barrier: migrations, DB warm, registry build). Under the same load
   spike the barrier can exceed 15s, so `wt.Ensure`/`wt.Restart` returns a 500 from
   `proxy.go` and the failure path **SIGKILLs the soon-to-be-healthy backend** (leaving
   it in `Broken` cooldown).

Net effect: a valid build fails to deploy purely because of transient host contention,
with a scary and incorrect error message.

## Root cause

Boot latency scales with host load, but the timeouts that gate boot are fixed. And the
CLI's smoke test treats "not ready within a fixed stopwatch window" as "crashed", when
the two are fundamentally different:

- **Boot crash** — the backend process *exits* (missing env, init cycle). `waitReady`
  detects this immediately via `exitCh` ("backend exited before ready"), regardless of
  the timeout.
- **Slow boot** — the process is alive and working; it just needs more wall-clock under
  load. This should never be reported as a crash.

## Design

**Principle:** timeouts that gate boot must scale with host load; and the build's verdict
(crash vs slow) must come from the gateway's *authoritative state*, not a stopwatch.

### Change 1 — Gateway: load-adaptive readiness timeout

- New `gateway/loadavg.go`:
  - `hostLoad1() (float64, bool)` — 1-minute load average. Linux reads `/proc/loadavg`;
    darwin reads the `vm.loadavg` sysctl. Returns `ok=false` on any error / unsupported
    OS (fail-safe → base timeout).
  - `adaptiveTimeout(base, max time.Duration) time.Duration` — `factor = 1 + max(0, load1 - numCPU)/numCPU`,
    result clamped to `[base, max]`. Falls back to `base` when load is unavailable.
- `Config` gains `ReadyTimeoutMax` (flag `-ready-timeout-max`, default **90s**); base
  `-ready-timeout` stays 15s.
- Both `waitReady(..., w.cfg.ReadyTimeout, ...)` call sites in `worktree.go` (cold `Ensure`
  + hot `Restart`) pass `adaptiveTimeout(w.cfg.ReadyTimeout, w.cfg.ReadyTimeoutMax)` and
  log the chosen value. `exitCh` still short-circuits a real crash instantly, so a
  generous ceiling never delays crash detection.

### Change 2 — Gateway: expose the spawn error for honest messaging

- `WorktreeStatus` (`worktree.go`) gains `LastSpawnErr string`, populated from
  `w.lastSpawnErr` in `Snapshot()`. Lets the CLI print the *real* boot-failure reason and
  distinguish "backend exited before ready" (crash) from "readiness timeout" (slow).

### Change 3 — CLI: adaptive, honest smoke test

- Shared adaptive-deadline helper (Node `os.loadavg()[0]` / `os.cpus().length`), same
  formula as the gateway.
- Raise the restart `POST` timeout above the gateway ceiling (adaptive, base 30s cap
  130s) so the CLI never aborts a restart the gateway is still legitimately completing.
- Rework `probeHealth`:
  - Adaptive deadline (base ~20s, cap ~120s), per-attempt `fetch` timeout so one hung
    request can't eat the budget.
  - **On deadline, classify via `GET /gateway/worktrees` state** for this worktree:
    - `broken` → real boot crash: `console.error` with `LastSpawnErr` + `process.exit(1)`.
    - `starting`/`restarting`/`idle` → slow boot: `console.warn` ("still booting under
      host load, artifacts valid, gateway will finish on demand") and **return** — do not
      fail the build.
    - `running` → healthy (race): success.
    - gateway unreachable → warn and continue (mirrors `probeGatewayHealth`).
- Restart `500` is likewise classified via gateway state before deciding to hard-fail.

## Out of scope / follow-ups

- `reconcileOrphanBackends` (`registry.go`) is boot-only and can reap a live-but-orphan
  backend when the *gateway itself* restarts. The adaptive timeout removes the
  during-build reap; the gateway-restart case is correct behavior (a prior-generation
  backend is genuinely unmanaged) and is left as-is. File a follow-up only if this proves
  to bite in practice.
