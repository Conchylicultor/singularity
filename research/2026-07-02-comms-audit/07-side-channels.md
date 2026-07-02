# 07 — Side Channels: Logs, Terminal, Transcripts, Reports, Central, Zero

> Part of the [communications audit](./00-overview.md). The communication
> surfaces that deliberately live *outside* the main endpoints/live-state
> pair — each with a reason.

## 1. Log channels (`primitives/log-channels`) — the wedge-proof channel

Purpose-built to keep working **when the live-state pipeline itself is the
thing being debugged**:

- **Browser**: `clientLog(channel, line)` buffers and flushes over **plain
  HTTP** (`POST /api/logs/emit`) — no WS dependency, survives a wedged
  socket.
- **Server**: `Log.channel(id, { persist: true }).publish(line)`.
- Both append to `~/.singularity/worktrees/<wt>/logs/<channel>.jsonl`
  (`{t, stream, line}` per line) — on disk, so logs survive the mid-build
  backend restart and are readable with `tail` even when the backend is
  dead. An in-memory ring buffer backs the live UI only.
- Live viewing: `/ws/logs` (history frame + entry frames) feeds the
  Debug → Logs pane; the gateway's own backend stdout/stderr is a separate
  Go-served SSE stream (`/gateway/worktrees/<name>/logs`) consumed via
  `ReconnectingEventSource` — the one SSE in the system, kept because the
  gateway can't host the TS WS stack.
- 19 plugins publish channels (db, change-feed, migrations, sync, watchers,
  live-state's own net-diag events…).

## 2. Terminal (`primitives/terminal`) — the raw byte firehose

The clearest Idiom-C case: PTY bytes are an append-only stream with no
level-state representation.

- Server: `/ws/terminal` (a hand-declared `WsHandler` — one of the few
  sanctioned non-resource WS routes) → `bun-pty` sessions
  (spawn/write/resize/kill, with an explicit close-on-exit workaround for
  bun-pty's fd leak).
- Client: `useReconnectingWebSocket` (per-pane socket — deliberately *not*
  the shared leader socket; every pane wants its own PTY).
- Consumer: the conversation terminal-pane attaches to the agent's tmux
  session — which is also the answer to "how do agents run": `runtime-tmux`
  spawns Claude CLI inside tmux, so the app can attach/detach a viewer
  without owning the process's stdio.

## 3. The conversation transcript spine (how agent output reaches the UI)

No bespoke streaming protocol — it's files + a watcher + one resource:

```
Claude CLI (in tmux) ──appends──▶ ~/.claude/projects/.../<session>.jsonl
        ▼ transcript-watcher (one @parcel/watcher fan-out; replaced two 500ms pollers)
jsonl-events resource (external, push mode, params {id})
   • onFirstSubscribe: start watching that conversation's transcript
   • notify({id}) per append → recompute → push
   • revalidate: lstat-based ETag (mtime+size) — resubscribes cost one stat,
     not a full file read+parse
   • onLastUnsubscribe: stop watching, drop cache
        ▼ /ws/notifications
JsonlViewer: useResource(jsonlEventsResource, {id}) → EventRenderer slot
   (assistant-text, thinking, tool-call renderers… all just slot plugins)
```

The write direction is plain endpoints: `POST /api/conversations/:id/turn`
injects a prompt into the tmux session; the optimistic "Sending…" echo is a
client-local store cleared when the real user-text event streams back.
Lifecycle facts (`created` / `turn-completed` / `userTurnSent`) are trigger
events fanning out to subscribers ([06](./06-jobs-and-events.md) §5).
Agents call back *into* the app via MCP ([03](./03-http-endpoints.md) §7).

This composition is worth noticing: a "live agent console" — normally a
bespoke streaming feature — is here a file watcher + an external resource +
slot renderers, all reused primitives.

## 4. Reports & crash pipeline (`reports`, `primitives/report-sink`)

The error/telemetry direction of client↔server traffic:

- **`defineReportSink()`** (runtime-agnostic): a named sink whose `emit()`
  **never throws** (it runs on error paths). Instances: `boundaryReportSink`
  (render crashes caught by slot error boundaries), `endpointErrorSink`
  (failed fetches, incl. NDJSON), mutation-error sink, wedge sink
  (main-thread stalls), render-loop sink.
- Browser reporters POST to the reports plugin; server-side errors go through
  `reportServerError` / `recordReport` directly.
- **`recordReport({kind, fingerprint, …})`** is the single funnel: dedupes by
  fingerprint (a retry storm = one report with a count), stores the report,
  and files **one task** per distinct problem into the task system — closing
  the loop with the product's whole premise ("fix todos faster than they're
  created": crashes become todos automatically). Monitors feed the same
  funnel: slow-ops, op-rate, queue-health, live-state churn.
- The boot-snapshot missing-descriptor case shows the degraded path: too
  early for the crash collector → direct keepalive POST.

## 5. Auth, secrets, and the central runtime

Cross-worktree user state ([01](./01-topology-and-transport.md) §5 for the
process topology):

- **secrets** (`infra/secrets`, central): AES-256-GCM blob, master key in the
  OS keychain; consumers call `/api/secrets/*` via the gateway; central
  plugins (auth, config secret fields) call in-process.
- **auth** (`plugins/auth/central`): provider registry
  (`defineAuthProvider` + per-provider sub-plugins), OAuth flows at
  `/api/auth/start|callback/:provider` (reachable on **any** host via the
  central-routes manifest — Google requires bare-localhost callbacks), token
  store in secrets, a 60s refresh loop.
- **State sync**: `authStateResource` is a `centralResourceDescriptor` —
  connect/disconnect/refresh push over `/ws/central-notifications` to every
  tab of every worktree. Connecting Gmail in one worktree lights up mail
  everywhere, with no cross-worktree fanout code.
- **Worktree servers** needing a token: `getTokenFromCentral()`
  (`@plugins/auth/server`) — an HTTP call to central through the gateway.
  Consumer: mail sync's Gmail client.

## 6. Metrics & health sampling (`debug/health-monitor`, `stats`)

- health-monitor: a continuous sampler writes per-backend event-loop lag /
  heap / phys_footprint to **per-worktree JSONL on disk** — chosen precisely
  so the data is readable *even when the sampled backend is wedged* (same
  design bet as log-channels); main additionally samples host load/mem/swap.
  The pane reads from disk.
- stats: chart plugins read aggregates via ordinary endpoints/resources —
  nothing transport-special; listed here to note that *no* metrics path
  invents a new channel.

## 7. Zero pilot (`database/plugins/zero`) — the possible future

The exploratory local-first branch of the
[IVM/instant-client vision](../2026-06-21-global-live-state-ivm-and-instant-client-vision.md)
(Axis B): move reads into the browser for 0ms interaction.

- **cache-service**: a per-worktree **Node** sidecar (the SQLite addon's ABI
  pins the Node major; can't run under Bun), spawned by the *gateway*,
  logically replicating the main Postgres DB (direct TCP, `wal_level=logical`
  — the reason the cluster runs with logical WAL) into a local SQLite
  replica. Per-worktree `ZERO_APP_ID` isolates replication slots/schemas; a
  main-only 5-minute sweep drops inactive `zero%` slots so crashed sidecars
  can't retain WAL forever.
- **client**: `ZeroRoot` (provider at `${origin}/zero`, gateway-proxied) +
  `useZeroResource(query)` — adapts Zero's query tuple into the same
  `ResourceResult` union `useResource` returns, so a Zero-backed read drops
  into existing views without call-site churn. That adapter *is* the
  migration strategy.
- Status: consumed only by `debug/zero-test` (a throwaway verification pane).
  Stage 1 = single-DB, read-only, anonymous. The competing path is doubling
  down on the in-house stack (declarative queries deriving loader +
  affectedMap + client shape from one definition — Axis A of the vision doc).

## 8. Assorted smaller channels

- **`infra/asset-mirror`**: remote asset → lazy first-request download →
  disk cache → same-origin serving (offline after warm-up). Communication
  shape: turn third-party fetches into local ones.
- **`infra/safe-fetch`**: the SSRF-guarded outbound `fetch` (DNS-pinned
  dialing, per-hop redirect revalidation) — mandatory for any server fetch of
  user-supplied URLs (wallpaper import, openverse).
- **`infra/claude-cli`**: one-shot `claude --print` subprocess calls
  (Haiku titles/categories/summaries) — process-spawn as a communication
  primitive, observable in the Debug → Claude CLI calls pane.
- **`infra/host-read-pool` / `packages/host-semaphore`**: cross-*process*
  concurrency budgets (flock slot files) so heavy git/FS reads across all
  worktree backends don't stampede the machine — the host-wide analogue of
  the in-process loader gate.
- **screenshot / draw-on-app**: capture → store in-flight server-side →
  freshly opened tab fetches it — a handoff-between-tabs channel via the
  server rather than BroadcastChannel (survives the tab boundary).
