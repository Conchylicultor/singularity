# log-channels

The persistent log-channel substrate. Browser and server code can emit named log
lines that persist to disk per worktree, decoupled from the live-state WebSocket
(the emitter flushes over plain HTTP), so logs still get through even when the
live-state pipeline is wedged. `debug/logs` is the read-only viewer on top of this.

## Durable vs ephemeral channels

Durability is a **declaration**, not a flag. There is no `persist` option: a
channel either declares a durable file sink or it doesn't.

- **Durable (server):** `defineLogSink({ id, description }).publish(line, stream?, t?)`
  from `@plugins/primitives/plugins/log-channels/server`. This registers the
  channel AND (lazily, on first publish) a `defineFileSink` under the per-worktree
  logs dir — one declared, enumerable, 128 MB × 3-rotation growth bound
  (`@plugins/infra/plugins/file-sink`, merged into `retention.getGrowthBounds()` as
  `file:<id>`). The `description` is what makes a perf sink (`health`,
  `health-host`, `slow-op-markers`) distinguishable from an ops log in
  `getFileSinks()`. Declared **exactly once** per id — a channel written from two
  modules hoists ONE `defineLogSink` into a shared module and imports it from both
  (a duplicate id throws). The sink is built lazily so declaring one is
  **import-safe** (no `SINGULARITY_WORKTREE` read at module eval — the barrel is
  imported inside the import-safe `@plugins/database/server` graph).
  A caller holding an ARRAY of lines calls `publishAll([{ line, stream?, timestamp? }])`
  instead of looping. `publishAll` is the single implementation and `publish`
  delegates to it with a one-element array, so the two can never drift. One
  `publishAll` is one ring trim and **one** `appendAll` file write, whatever the
  batch size; per-line WS delivery is unchanged (one listener callback per line, in
  order). The order inside it is ring → sink → listeners, so "durable before
  broadcast" holds per batch.

- **Ephemeral (server):** `Log.channel(id).publish(...)` — in-memory ring buffer
  only, no disk.
- **Browser:** `clientLog(channel, line)` from
  `@plugins/primitives/plugins/log-channels/web` → `POST /api/logs/emit`. The
  ingress persists via `openDynamicSink` (the one open-ended, browser-supplied
  channel family, covered by the single declared `client-log` family bound). The
  route-internal `emitClientLogs` is the ONLY persist-from-arbitrary-input path; it
  is **not** exported from the barrel. It takes the whole validated request body
  rather than one line — the array is the unit at every layer, so **one POST is
  one file write** (a 500-line batch used to be ~2000 blocking syscalls on the
  event loop) and there is no singular entry point left for a handler to loop over.

Durable channels append to `~/.singularity/worktrees/<wt>/logs/<channel>.jsonl`,
one JSON object per line: `{"t":<ms>,"stream":"stdout"|"stderr","line":"..."}`. The
file survives the backend restart that `./singularity build` performs mid-build;
the in-memory ring buffer only backs the live UI pane.

### Reading logs

`tail`/`cat` the `.jsonl` file directly. This plugin owns only the **read** path
(`readChannelEntries`, `listChannels`); the **write/rotation** half lives in
`@plugins/infra/plugins/file-sink`.

Server-side, `readChannelEntries(worktree, channel, tail)` returns the last
`tail` envelope rows (`{ t, stream, line }`), or `null` for a missing channel.
Most consumers store one JSON object per line and want it back typed — for that
use `readChannelJson(worktree, channel, tail, schema)`: it unwraps each
envelope's `line`, tolerantly `JSON.parse`es it (a torn tail line is skipped),
`schema.safeParse`-drops invalid rows, and returns the valid `T[]`. A
missing/empty channel collapses to `[]`; a caller that must distinguish "no
channel yet" from "channel present but empty" uses `readChannelEntries` (which
returns `null`) directly. (Callers keep their own tail cap and any post-read
window/cutoff/pairing.)

### Rotation

The file sink rotates each channel's live file at a **128 MB** cap, gated on an
in-memory per-file byte counter (no `statSync` per append). It keeps **3** rotated
files named `channel.jsonl.N` (suffix appended *after* `.jsonl`, so `listChannels`
excludes them); the oldest is unlinked. `readChannelEntries` currently reads **only**
the live `channel.jsonl`, so a tail that spans a just-rotated boundary is truncated to
the current file — acceptable at 128 MB. If full history across a rotation is ever
needed, extend it to fall back across `channel.jsonl.1…N`.

### Backpressure: the endpoint can say "stop"

`POST /api/logs/emit` answers **429** while the host-global duress latch is set
(`isUnderDuress()` from `@plugins/infra/plugins/host/plugins/duress/plugins/latch/server`, one
read per request, memoized to at most one `statSync` per 2 s). This is the one
observability channel whose volume driver is *external* — a browser that keeps
POSTing regardless of host state — so during an episode the whole request is
refused before the parse, the ring pushes, the file write and the WS fan-out.

**429, not 503.** The client-side endpoint-error reporter files a crash report for
every `status >= 500`, so a 503 would make each rejected POST file a "server
error" report *during* duress — a report storm set off by the storm-suppression
mechanism itself. Do not "upgrade" the status.

Nothing is lost. `clientLog`'s buffer re-queues the rejected batch in order and
retries it: on the next debounced flush, on the WS reconnect, and — new — on a
one-shot timer armed on the failure edge, so a tab that goes quiet right after a
rejection still drains. That buffer is also capped per channel (4 000 lines,
**drop-oldest** — the opposite of the server shed buffer's drop-newest, because
the browser has no first-N-durable guarantee and its newest lines describe the
problem the user is looking at). A drop is never silent: one
`[clientLog] dropped N lines under backpressure` line takes the head slot, and its
count accumulates across drops.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Persistent log-channel substrate: clientLog browser emitter that buffers and flushes log lines over plain HTTP to the per-worktree JSONL files. Server barrel owns Log/persist/registry and the /api/logs/* + /ws/logs routes; debug/logs is the viewer.
- Load-bearing: yes
- Web:
  - Uses:
    - `infra/endpoints.EndpointError`
    - `infra/endpoints.fetchEndpoint`
    - `primitives/copy-to-clipboard.CopyButton`
    - `primitives/css/fill.Fill`
    - `primitives/css/line.Line`
    - `primitives/css/pin.Pin`
    - `primitives/css/scroll.Scroll`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/text.textVariantClass`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.ControlSizeProvider`
    - `primitives/dom/auto-scroll.JumpToBottomButton`
    - `primitives/dom/auto-scroll.useStickyScroll`
    - `primitives/networking.subscribeWsStatus`
    - `primitives/networking.useReconnectingWebSocket`
    - `primitives/networking.wsUrl`
  - Exports (types):
    - `LiveLogChannelProps`
    - `LogEntryListProps`
  - Exports (values):
    - `clientLog`
    - `LiveLogChannel`
    - `LogEntryList`
- Server:
  - Uses:
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `infra/host/duress/latch.isUnderDuress`
    - `infra/paths.worktreeDataDir`
  - Exports (types):
    - `LogChannel`
    - `LogStream`
  - Exports (values):
    - `defineLogSink`
    - `listChannels`
    - `Log`
    - `logsDirFor`
    - `readChannelEntries`
    - `readChannelJson`
  - Routes:
    - `GET /api/logs/channels`
    - `POST /api/logs/emit`
    - `/ws/logs (WS)`
- Core:
  - Uses: `infra/endpoints.defineEndpoint`
  - Exports (types):
    - `ClientMessage`
    - `EmitLogsBody`
    - `EntryMsg`
    - `ErrorMsg`
    - `HistoryMsg`
    - `LogEntryWire`
    - `ServerMessage`
    - `SubscribeMsg`
  - Exports (values):
    - `emitLogs`
    - `EmitLogsBodySchema`
    - `getLogChannels`
    - `MAX_EMIT_LINES`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/deployments`
    - `apps/deploy/remote-deploy`
    - `apps/events/refresh`
    - `apps/mail/sync`
    - `apps/sonata/piano-roll`
    - `apps/studio/compositions/release/release-logs`
    - `backup`
    - `build`
    - `conversations/transcript-retention`
    - `database`
    - `database/change-feed`
    - `database/derived-tables`
    - `database/derived-views`
    - `database/live-state-snapshot`
    - `database/migrations`
    - `debug/boot-events`
    - `debug/boot-watchdog`
    - `debug/health-monitor`
    - `debug/logs`
    - `debug/op-rate`
    - `debug/paging-probe`
    - `debug/render-profiler`
    - `debug/sentinel`
    - `debug/slow-ops`
    - `debug/timeline`
    - `debug/worktree-cleanup`
    - `infra/attachments`
    - `infra/host/duress`
    - `infra/jobs`
    - `infra/worktree/removal-audit`
    - `primitives/live-state`
    - `release`
    - `reports/render-loop`
    - `shell/notifications`
    - `stats/cost`

<!-- AUTOGENERATED:END -->
