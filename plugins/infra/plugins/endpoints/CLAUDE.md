# endpoints

Typed HTTP endpoint contracts. Declare once in `core/`; derive server validation and the web client from that single definition — no duplicated URL strings, no manual `as` casts.

## Three-layer pattern

**1. Define** — `core/endpoints.ts` (importable from any runtime):

```typescript
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getAgent = defineEndpoint({
  route: "GET /api/agents/:id",   // method + path in one string; :id inferred as params.id
  response: AgentSchema,
});

export const updateAgent = defineEndpoint({
  route: "PATCH /api/agents/:id",
  body: UpdateAgentBodySchema,    // validated on server, type-checked on client
  response: AgentSchema,
});
```

**2. Implement** — `server/internal/handle-*.ts`:

```typescript
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getAgent } from "../../core/endpoints";

export const handleGet = implement(getAgent, async ({ params }) => {
  const row = await db.select()…where(eq(agents.id, params.id))…limit(1);
  if (!row) throw new HttpError(404, "Not found");
  return row;  // auto-wrapped in Response.json(); void → 204
});
```

Wire into `httpRoutes` via the computed key: `{ [getAgent.route]: handleGet }`.

**3. Consume** — web components:

```typescript
import { useEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";

// GET — wraps useQuery; params type-checked against route template
const { data } = useEndpoint(getAgent, { id });

// PATCH — wraps useMutation; invalidates listed queries on success
const { mutateAsync } = useEndpointMutation(updateAgent, { invalidates: [getAgent] });
await mutateAsync({ id }, { body: { name: "new" } });
```

Use `fetchEndpoint` for imperative fetches outside React. Non-2xx responses throw `EndpointError(status, body)`.

To make a GET available on the **first render** (no loading flash), seed it from a `Core.Boot` task with `hydrateEndpoint(endpoint, params, opts, data)` — exported from `@plugins/primitives/plugins/live-state/web` (live-state owns the app's default QueryClient and sits downstream of endpoints, so the import can only point that way). It writes the exact query key `useEndpoint` reads via the shared `endpointQueryKey` helper this plugin exports, so the two cannot drift. Canonical use: tweakcn's preset list (`plugins/ui/plugins/tweakcn/web/boot.ts`).

## Non-JSON payloads (codecs)

A bare Zod schema in `body:`/`response:` means **JSON** — that's the default and covers ~all endpoints. Binary and multipart payloads opt into the *same* `body:`/`response:` slot via a **codec** exported from `@plugins/infra/plugins/endpoints/core`:

```typescript
import { blob, multipart } from "@plugins/infra/plugins/endpoints/core";

export const createScreenshot = defineEndpoint({
  route: "POST /api/screenshot",
  body: blob("image/png"),                 // raw binary request; sets Content-Type
  response: z.object({ id: z.string() }),  // bare schema → JSON response
});

export const getScreenshot = defineEndpoint({
  route: "GET /api/screenshot/:id",
  response: blob(),                        // typed Blob response (client decodes via res.blob())
});

export const uploadAttachment = defineEndpoint({
  route: "POST /api/attachments",
  body: multipart(),                       // FormData upload; the browser sets the boundary
  response: UploadedAttachmentSchema,
});
```

- `blob(contentType?)` — raw binary on the request (`body:`) or response (`response:`) side. The client encodes/decodes via `Blob`. A server handler that needs custom response headers (e.g. `cache-control`, `content-disposition`) may stay a raw handler instead of using `implement()` — `blob()` carries only the body.
- `multipart()` — **request-only** FormData. No `Content-Type` is set so the browser supplies the multipart boundary; using it in a `response:` slot throws.

`fetchEndpoint` also accepts two transport opts for fire-and-forget beacons:

```typescript
void fetchEndpoint(submitReport, {}, { body, keepalive: true, report: false });
```

- `keepalive: true` — RequestInit passthrough so the request survives page unload (crash/analytics beacons).
- `report: false` — skips endpoint error reporting for that call. Required for the crash beacon so a failing report can't recurse back into the crash pipeline. Defaults to `true`.

## Global error handling

Every `useEndpointMutation` call is covered by a global toast safety net in `shell/toaster`. If a mutation errors and the error is unhandled, `getEndpointErrorMessage` extracts a human-readable string (prefers `body.message` over `"HTTP <status>"`) and `toast.error` fires automatically.

**Default: provide `onError` → global toast is silenced automatically.**

```typescript
// No onError — global toast fires on error (zero boilerplate)
useEndpointMutation(deleteTask);

// onError provided — toast suppressed; only the local handler runs
useEndpointMutation(deleteTask, {
  onError: (err) => setFormError(err.message),
});

// Show error inline via mutation.error — suppress without a local handler
useEndpointMutation(deleteTask, { meta: { suppressError: true } });

// Run a local side-effect AND still show the global toast (e.g. analytics)
useEndpointMutation(deleteTask, {
  onError: (err) => analytics.track(err),
  meta: { suppressError: false },
});
```

The `meta.suppressError` flag is also available on raw `useMutation` calls for non-endpoint mutations.

## `useEndpointMutation` vs `void fetchEndpoint()`

**Default: `useEndpointMutation` for all user-triggered mutations.** It gives you loading state, cache invalidation, and global error surfacing for free.

**`void fetchEndpoint()` only for genuine fire-and-forget** — background side-effects where two conditions hold simultaneously:
1. A failure is silent and self-correcting (the user can recover without knowing it happened).
2. State refreshes via another channel — a live-state WS push or the next user interaction — so no manual `invalidates` is needed.

Canonical examples: DnD rank writes (drag again to fix), notification dismissal (reappears on next load).

**Never reach for `void fetchEndpoint()` to skip error handling lazily.** If you want to suppress the toast without a local handler, use `meta: { suppressError: true }` on `useEndpointMutation` instead. `void fetchEndpoint()` bypasses the global handler entirely; the promise rejection still surfaces via the global `unhandledrejection` handler but is otherwise invisible to the user.

```typescript
// ✓ Fire-and-forget: rank update during DnD — silent failure is acceptable,
//   live-state WS push will correct the view on next event
void fetchEndpoint(updateRank, { id }, { body: { rank } });

// ✗ Wrong: delete is user-triggered; failure should surface via toast
void fetchEndpoint(deleteTask, { id });

// ✓ Right: use useEndpointMutation so global error handler fires
const { mutateAsync } = useEndpointMutation(deleteTask);
await mutateAsync({ id });

// ✓ Right: suppress the toast explicitly when you handle errors inline
const { mutateAsync } = useEndpointMutation(deleteTask, { meta: { suppressError: true } });
```

## Enforced invariants

- **Web code must use `fetchEndpoint`/`useEndpoint`.** Raw `fetch(...)` /
  `fetchWithRetry(...)` to `/api/...` from web code is forbidden — enforced by
  the `no-raw-web-fetch` lint rule and the `endpoints:typed-web-fetches` check.
- **No `void fetchEndpoint(...)` for user-triggered mutations.** A discarded
  endpoint promise lets a non-2xx response escape to `window.onunhandledrejection`
  (a contextless `browser-rejection` crash, never a toast) — enforced by the
  `no-void-fetch-endpoint` lint rule. Use `useEndpointMutation`. Genuine
  fire-and-forget (see below) opts out explicitly: a whole-file glob in
  `lint/index.ts` or an inline
  `// eslint-disable-next-line endpoints/no-void-fetch-endpoint -- <why>`.
- **JSON server responses must go through `implement()`.** A raw
  `Response.json()` in a server/central handler is forbidden — enforced by
  `endpoints:no-raw-json-handlers`. Raw `new Response(...)` handlers remain
  allowed only for binary / stream / custom-status responses (where
  `implement()`'s 200/204 contract doesn't fit).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Typed endpoint contract primitive. fetchEndpoint, useEndpoint, and useEndpointMutation consume endpoint definitions on the client. Typed endpoint contract primitive. defineEndpoint declares the contract; implement() creates the server handler; fetchEndpoint/useEndpoint consume on the client.
- Load-bearing: yes
- Core:
  - Uses: `infra/runtime-profiler.recordEntrySpan`
  - Exports: Types: `Codec`, `EndpointDef`, `ExtractParams`; Values: `blob`, `dateString`, `defineEndpoint`, `extractMethod`, `extractPath`, `HttpError`, `implement`, `interpolatePath`, `isCodec`, `multipart`
- Cross-plugin:
  - Imported by: `active-data`, `active-data/plugin-link`, `active-data/task`, `apps/deploy/servers`, `apps/pages/page-tree`, `apps/sonata/library`, `apps/sonata/playback-history`, `apps/sonata/sources/chord-grid`, `apps/sonata/sources/midi`, `apps/sonata/track-mixer`, `apps/story/generation`, `apps/story/marker`, `apps/story/shell`, `apps/studio/contributions`, `apps/studio/contributions/tables/columns`, `apps/studio/contributions/tables/foreign-keys`, `apps/studio/contributions/tables/indexes`, `apps/studio/contributions/tables/row-count`, `apps/studio/contributions/tables/sample-rows`, `apps/studio/explorer`, `apps/workflows/engine`, `auth`, `auth/google/setup-wizard`, `backup`, `build`, `build/build-commits`, `build/build-fix`, `build/build-logs`, `build/build-profiling`, `code-explorer`, `code-explorer/code-api`, `code-explorer/file-resolve`, `config_v2`, `config_v2/settings`, `conversations`, `conversations/agents`, `conversations/conversation-category`, `conversations/conversation-view`, `conversations/conversation-view/allow-monitor`, `conversations/conversation-view/code/docs-button`, `conversations/conversation-view/code/file-pane`, `conversations/conversation-view/code/file-pane/diff`, `conversations/conversation-view/commits-graph`, `conversations/conversation-view/dependencies`, `conversations/conversation-view/drop-and-exit`, `conversations/conversation-view/drop-dependents`, `conversations/conversation-view/exit`, `conversations/conversation-view/hold-and-exit`, `conversations/conversation-view/jsonl-viewer/tool-call/ask-user-question`, `conversations/conversation-view/launch-prompts`, `conversations/conversation-view/notes`, `conversations/conversation-view/prompt-input`, `conversations/conversation-view/prompt-templates`, `conversations/conversation-view/push-and-exit`, `conversations/conversation-view/push-profiling`, `conversations/conversation-view/resume`, `conversations/conversations-view`, `conversations/conversations-view/grouped`, `conversations/conversations-view/queue`, `conversations/recover`, `conversations/summary`, `conversations/transcript-api`, `debug/broadcasts`, `debug/logs`, `debug/memory`, `debug/profiling/boot`, `debug/profiling/build`, `debug/profiling/push`, `debug/profiling/runtime`, `debug/profiling/stats`, `debug/queue`, `debug/worktree-cleanup`, `infra/attachments`, `infra/events`, `infra/events-test`, `infra/health`, `infra/jobs`, `infra/secrets`, `page/editor`, `page/inline-page-link`, `page/turn-into-page`, `plugin-meta/plugin-health`, `plugin-meta/plugin-view`, `plugin-meta/plugin-view/file-tree`, `primitives/folder-picker`, `primitives/launch`, `primitives/live-state`, `primitives/log-channels`, `reports`, `reports/endpoint-errors`, `reports/mutation-errors`, `review/code-review`, `review/plugin-changes`, `screenshot`, `shell/notifications`, `stats/commits`, `stats/cost`, `stats/pushes`, `stats/tasks`, `tasks`, `tasks/task-attachments`, `tasks/task-dependencies`, `tasks/task-description`, `tasks/task-draft-form`, `tasks/task-events`, `tasks/task-graph`, `tasks/task-list`, `tasks/task-list/tree`, `tasks/task-preprompt`, `ui/theme-engine`, `ui/theme-engine/theme-customizer`, `ui/tweakcn`, `ui/tweakcn/community-browser`
- Web:
  - Exports: Types: `EndpointErrorInfo`; Values: `EndpointError`, `endpointQueryKey`, `fetchEndpoint`, `getEndpointErrorMessage`, `registerEndpointErrorReporter`, `reportEndpointError`, `useEndpoint`, `useEndpointMutation`
- Server:
  - Exports: Values: `HttpError`, `implement`

<!-- AUTOGENERATED:END -->
