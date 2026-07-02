# 03 — HTTP: Typed Endpoints, Streams, Health, Uploads, MCP

> Part of the [communications audit](./00-overview.md). This file covers the
> request/response idiom: the `endpoints` contract primitive and the raw-HTTP
> surfaces that legitimately sit outside it (NDJSON streams, MCP, binary).

## 1. The problem the endpoints primitive solves

A raw `fetch("/api/tasks/" + id)` has four silent drift points: the URL, the
method, the body shape, and the response shape — none checked by the
compiler, all duplicated between client and server. The endpoints primitive
collapses them into **one contract object** that both sides import:

```ts
// plugins/<name>/core/endpoints.ts  — the single source of truth
export const getAgent = defineEndpoint({
  route: "GET /api/agents/:id",          // method + path in one string
  response: AgentSchema,                  // zod
});
export const updateAgent = defineEndpoint({
  route: "PATCH /api/agents/:id",
  body: UpdateAgentBodySchema,
  response: AgentSchema,
});
```

`:id` segments become a typed `params` object via template-literal type
inference — no runtime route parsing beyond a string split.

## 2. Server half — `implement()` (`infra/endpoints`)

```ts
export const handleGet = implement(getAgent, async ({ params, body, query, req }) => {
  const row = await loadAgent(params.id);
  if (!row) throw new HttpError(404, "Not found");
  return row;                             // zod-encoded, typed
});

// server/index.ts — the route STRING is the route-table key:
const plugin: ServerPluginDefinition = {
  httpRoutes: { [getAgent.route]: handleGet, [updateAgent.route]: handleUpdate },
};
```

What `implement()` layers on a plain handler, in order:

1. **Decode**: body via the codec (JSON by default), query via zod
   `safeParse` — invalid input never reaches the handler.
2. **`dedupe`** (opt-in, GET-only, boot-time assert): collapses concurrent
   identical requests into one in-flight execution
   (`packages/inflight`).
3. **`concurrency`** (opt-in): a per-route semaphore
   (`packages/semaphore`) capping simultaneous handler bodies —
   protects fan-out-heavy routes.
4. **Profiling**: `recordEntrySpan("http", route, …)` — every endpoint is
   automatically attributed in the runtime profiler and slow-op pipeline.
5. **Encode**: `void`/`null` → 204; `HttpError(status, msg)` → that status;
   any other throw escapes to server-core's `safeHandle` (log + crash report
   + generic 500).

**Codecs** widen the contract beyond JSON: `json(schema)` (implicit default),
`blob(contentType)` (binary either direction), `multipart()` (request-only —
file uploads). Same contract object, same client call sites.

## 3. Client half

```ts
// One-shot read (TanStack Query; key derived from the contract, never hand-written)
const { data, isPending } = useEndpoint(getAgent, { id });

// Mutation with auto-invalidation of dependent endpoint caches
const { mutateAsync } = useEndpointMutation(updateAgent, { invalidates: [getAgent] });

// Imperative (non-React, boot tasks, event handlers)
const agent = await fetchEndpoint(getAgent, { id });
```

- Non-2xx → `EndpointError { status, body }`, and the failure is emitted to
  `endpointErrorSink` (a report-sink → deduped crash task) unless the caller
  opts out — **failed requests are observable by default**.
- `useEndpointMutation` toasts errors globally unless the caller handles them
  (`onError` auto-suppresses the toast) — no silent failures.
- `fetchEndpoint` supports `keepalive: true` for unload-surviving beacons
  (used by the boot-snapshot missing-descriptor reporter).

**Enforcement** (this is what makes it *the* idiom rather than a convention):
raw `fetch`/`fetchWithRetry` of `/api/...` in web code fails the
`no-raw-web-fetch` lint; raw `Response.json()` in server handlers fails
`endpoints:no-raw-json-handlers`; `void fetchEndpoint(...)` on user-triggered
mutations fails `no-void-fetch-endpoint`. 92 plugins import the primitive —
it is the most-consumed contract surface in the repo.

## 4. Streaming responses — `infra/ndjson-stream`

For responses that should render progressively or outlive Bun's ~10s idle
fetch timeout (heavy fan-outs like the worktree-cleanup audit). Not for state
sync — that's live-state.

```ts
// server (a raw handler — the one sanctioned bypass of implement())
export const handleAudit = () =>
  ndjsonResponse(async (emit) => {
    for (const wt of worktrees) emit(await auditOne(wt));  // one JSON line each
  });

// client
for await (const frame of readNdjson("audit", "/api/worktrees/audit")) render(frame);
```

Contracts kept even here: a producer throw becomes a final `{"error": …}`
line (stream always ends cleanly); a non-OK response both throws
`EndpointError` and reports to the endpoint error sink — streamed routes get
the same observability as typed ones. There is **no SSE** in TS code —
`text/event-stream` is banned by check; the only SSE in the system is the
gateway's own Go-served backend-log stream (consumed via
`ReconnectingEventSource`).

## 5. Health & readiness — `infra/health`

Two tiny endpoints with outsized roles:

- `GET /api/health` → `{ ok: true, startedAt }` where `startedAt` is captured
  at module load — a **process identity**. `waitForRestart(prevStartedAt)`
  polls until it changes (used by the launcher after builds).
- `GET /api/health/ready` → 200 only after `markServerReady()` (the
  `onReadyBlocking` barrier). **This is the gateway's hot-swap gate** — the
  entire zero-downtime deploy hangs off this one endpoint.

Three complementary client-side "is the server fresh?" mechanisms (easy to
conflate, deliberately separate):

1. **Transport-level**: `ReconnectWatcher` toasts "Reconnected" off the
   `ws-status-bus` (any socket drop, not just restarts).
2. **Process-level**: `startedAt` comparison (above).
3. **Bundle-level**: `frontendHashResource` (push resource) carries the
   server's `.build-id`; `useStaleFrontend()` compares against the baked
   `VITE_BUILD_ID` and shows the "Server updated — reload" affordance
   ([05-boot-and-hydration](./05-boot-and-hydration.md) §7).

## 6. File uploads — `infra/attachments`

The binary path: `uploadAttachment(file)` (web) → `POST /api/attachments`
(multipart codec) → UUID-named file under `~/.singularity/attachments/` + a
row in `_attachments`; served back via `GET /api/attachments/:id`.

Ownership is polymorphic via **link tables**: a consumer declares
`Attachments.defineLink(ownerTable)`, getting a typed protocol handle —
`set(ownerId, ids)` (mirror a replaceable source), `add(ownerId, ids)`
(atomic append-only union), `list(ownerId)`. The handle is deliberately
**not** a query DSL; operations exist because the subsystem's contract needs
them (orphan-sweep correctness, FK shape, atomicity). A scheduled
`attachments.orphan-sweep` job reclaims rows no link table references past a
TTL. 17 consumer plugins (conversations, tasks, pages, mail, paste-images…).

## 7. MCP — how agents call the app (`infra/mcp`)

Agents (Claude CLI sessions) reach app functionality through an HTTP MCP
server at `POST /api/mcp/:conversationId` — an ordinary gateway-proxied
route, no special transport.

- Plugins contribute tools via `Mcp.tool({ name, description, inputSchema,
  handler })` in their `register:` array; duplicate names throw at boot.
- The handler constructs a **fresh `McpServer` + streamable-HTTP transport
  per request** (stateless, `enableJsonResponse: true`), registering the
  current tool registry each time — a newly booted plugin's tool is live on
  the next request with zero wiring.
- `conversationId` from the URL threads into every tool handler — this is how
  `add_task` or `query_db` knows which agent/worktree is calling.

Current contributors: `tasks` (`add_task`), `database/query` (`query_db`),
`debug/queue-health` (`get_queue_health`), `debug/profiling/*`
(`benchmark_boot`, `get_runtime_profile`), `conversations/summary`,
`conversations/push-and-exit` (`exit_clean`/`flag_raise`),
`plugin-meta/plugin-health`.

## 8. Low-level client networking — `primitives/networking`

The substrate everything above sits on (web-only):

| API | What it is | Consumers |
|---|---|---|
| `SharedWebSocket` | Cross-tab-deduped WS: leader tab owns the real socket (via `CrossTabElection`), followers relay send/receive over BroadcastChannel. Backoff `[500,1000,2000,5000]ms` × 0.5–1.5 jitter. | live-state's `/ws/notifications` + `/ws/central-notifications` |
| `CrossTabElection` | Generic leader election: `navigator.locks` exclusive lock held forever + 4s heartbeats over BroadcastChannel + 12s staleness steal. Degrades to everyone-is-leader without the APIs. | SharedWebSocket |
| `useReconnectingWebSocket` | Per-instance (non-shared) reconnecting WS hook; equal-jitter backoff to de-sync tab fleets; 1000-message offline send queue; close-code 4000 = deliberate unmount. | terminal, logs viewer, build logs, release logs |
| `ReconnectingEventSource` | Reconnecting SSE wrapper — exists solely for the gateway's Go-served log stream. | debug/logs (gateway channel) |
| `fetchWithRetry` | Raw fetch + retry on 502/503/504/network, exponential jittered backoff. Non-`/api` targets only (lint-enforced). | gateway probes |
| `ws-status-bus` / `net-diag-bus` | Module-level pub/sub of socket status (coarse, for UI) and election/reconnect lifecycle events (fine, forwarded into a persistent log channel by live-state — the indirection avoids an import cycle). | health's ReconnectWatcher; live-state-health debug pane |
