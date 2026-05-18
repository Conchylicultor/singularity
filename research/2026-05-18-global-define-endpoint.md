# `defineEndpoint` — Typed Endpoint Contracts

Date: 2026-05-18

## Context

Every HTTP handler currently suffers from three forms of duplication:

1. **Params**: Route string `"GET /api/agents/:id"` declares `:id`, but the handler manually checks `params.id` and guards with `if (!id) return 400`
2. **Body**: The shape mirrors Drizzle table columns, but handlers cast with `as { ... }` — no validation, easy to drift
3. **Response**: The server returns typed data, but the web layer casts with `(await res.json()) as Agent`

Additionally, the web layer hardcodes URL strings (`fetch(\`/api/agents/${id}\`)`) — a rename on the server silently breaks the client.

**Goal**: Declare the endpoint contract once, derive server validation + web client from it.

## Design

### Plugin location

New infra plugin: `plugins/infra/plugins/endpoints/` with `core/`, `server/`, and `web/` runtimes.

```
plugins/infra/plugins/endpoints/
├── package.json
├── CLAUDE.md
├── core/
│   ├── index.ts                # barrel
│   ├── define-endpoint.ts      # defineEndpoint() + EndpointDef type
│   └── route-params.ts         # template-literal type ExtractParams + runtime helpers
├── server/
│   ├── index.ts                # barrel: exports implement, HttpError
│   └── internal/
│       └── implement.ts        # .implement() wrapper → returns HttpHandler
└── web/
    ├── index.ts                # barrel: exports fetchEndpoint, useEndpoint, useEndpointMutation, EndpointError
    └── internal/
        ├── fetch-endpoint.ts   # typed fetch() wrapper + EndpointError
        ├── use-endpoint.ts     # useQuery hook for GET endpoints
        └── use-endpoint-mutation.ts  # useMutation hook for POST/PATCH/DELETE
```

### API surface

#### 1. `defineEndpoint` (core/)

```typescript
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getAgent = defineEndpoint({
  route: "GET /api/agents/:id",
  response: AgentSchema,
});

export const updateAgent = defineEndpoint({
  route: "PATCH /api/agents/:id",
  body: AgentPatchSchema,
  response: AgentSchema,
});

export const listConversations = defineEndpoint({
  route: "GET /api/conversations",
  query: z.object({ limit: z.coerce.number().optional(), before: z.string().optional() }),
  response: z.array(ConversationSchema),
});
```

Returns a plain data object (`EndpointDef`) importable from any runtime. The params type is inferred from the route string via template literal types — no manual Zod schema for string params.

#### 2. `implement` (server/)

```typescript
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getAgent } from "../core/endpoints";

export const handleGet = implement(getAgent, async ({ params, req }) => {
  const [row] = await db.select().from(agents).where(eq(agents.id, params.id)).limit(1);
  if (!row) throw new HttpError(404, "Not found");
  return row;  // ← typed as Agent, auto-wrapped in Response.json()
});
```

- Returns a standard `HttpHandler` — plugs into existing `httpRoutes` unchanged
- Validates body against the Zod schema (400 on failure)
- Validates query params against the query schema (400 on failure)
- `HttpError` short-circuits with the given status/message
- Handler return value is auto-serialized to `Response.json()`; `void`/`undefined` → 204

#### 3. Web client (web/)

**`useEndpoint`** — wraps `useQuery` for GET endpoints:

```typescript
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getAgent, listAgents } from "../core/endpoints";

// Single item
const { data: agent, isLoading, error } = useEndpoint(getAgent, { id });

// List with query params
const { data: conversations } = useEndpoint(listConversations, {}, { query: { limit: 50 } });
```

Internally calls `useQuery({ queryKey: ["endpoint", route, params], queryFn: () => fetchEndpoint(...) })`. Uses the same `QueryClient` provided by `NotificationsProvider`.

**`useEndpointMutation`** — wraps `useMutation` for POST/PATCH/DELETE:

```typescript
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { updateAgent, listAgents, getAgent } from "../core/endpoints";

const { mutateAsync, isPending } = useEndpointMutation(updateAgent, {
  invalidates: [listAgents, getAgent],  // auto-invalidate these queries on success
});

// In a click handler:
await mutateAsync({ id }, { body: { name: "new name" } });
```

- `isPending` — free loading state for buttons/forms
- `invalidates` — after success, refetches active `useEndpoint` queries for the listed endpoints. Optional: endpoints backed by `useResource` (live-state) already invalidate via WS push.
- `onSuccess` / `onError` — standard TanStack Query callbacks

**`fetchEndpoint`** — low-level imperative fetch (escape hatch, outside React):

```typescript
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";

// Works for any method — GET, POST, PATCH, DELETE
const agent = await fetchEndpoint(getAgent, { id });
await fetchEndpoint(deleteAgent, { id });
```

**Common properties:**
- Params are type-checked against the route template
- Body is type-checked against the body schema
- Response is parsed through the response Zod schema (runtime validation, catches drift)
- Throws `EndpointError(status, body)` on non-2xx responses

### Template literal param inference

```typescript
// core/route-params.ts
type ExtractParamKeys<S extends string> =
  S extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractParamKeys<Rest>
    : S extends `${string}:${infer Param}`
      ? Param
      : never;

export type ExtractParams<Route extends string> =
  ExtractParamKeys<Route> extends never
    ? Record<string, never>
    : { [K in ExtractParamKeys<Route>]: string };
```

`"GET /api/agents/:id"` → `{ id: string }`. No manual Zod schema needed for standard string params.

### Integration with `httpRoutes`

No router changes. `.implement()` returns `HttpHandler`, the existing type:

```typescript
// plugins/agents/server/index.ts
import { getAgent, updateAgent, deleteAgent } from "../core/endpoints";
import { handleGet } from "./internal/handle-get";
import { handleUpdate } from "./internal/handle-update";

httpRoutes: {
  [getAgent.route]: handleGet,        // ← implement() already called in the file
  [updateAgent.route]: handleUpdate,
  // non-migrated handlers still work side-by-side:
  "POST /api/agents/:id/launch": handleLaunch,
}
```

### Relationship to `useResource` (live-state)

These are complementary, not competing:

- **`useResource`** — for data that changes server-side and needs to stay in sync (WS push/invalidate). Already has its own Zod schema validation.
- **`useEndpoint`** — for one-shot fetches (detail views loaded on-demand, paginated lists) and as the typed client for mutations.

Most list/detail GETs will continue using `useResource`. `useEndpoint` fills the gap for endpoints that don't have a live-state resource, or for simple TanStack Query usage without setting up the full resource machinery.

### Error handling

**Server side**: `throw new HttpError(status, message)` in the handler. The `implement` wrapper catches it and returns `new Response(message, { status })`. Unknown exceptions propagate to `safeHandle` in `server/src/index.ts` (500 + error reporting).

**Web side**: `fetchEndpoint` throws `EndpointError` for non-2xx. Callers catch specific statuses:

```typescript
try {
  await fetchEndpoint(deleteAgent, { id });
} catch (err) {
  if (err instanceof EndpointError && err.status === 409) {
    toast("Agent has children");
  } else throw err;
}
```

### Central runtime

Same pattern works unchanged — `CentralPluginDefinition` uses the same `HttpHandler` type. Central plugins import from `@plugins/infra/plugins/endpoints/core` and `@plugins/infra/plugins/endpoints/server` identically.

### Where endpoint definitions live per plugin

- **Default**: `core/endpoints.ts` (importable cross-plugin)
- **If no cross-plugin callers exist**: `shared/endpoints.ts` is acceptable (agents, config)
- The endpoint file imports the plugin's existing Zod schemas (`shared/schemas.ts` or `core/`)

## Migration strategy

**Phase 1** — Ship the primitive + one reference migration:
1. Create `plugins/infra/plugins/endpoints/` with core/server/web
2. Migrate `agents` plugin end-to-end (7 endpoints, has CRUD + custom)
3. Validate type inference, runtime behavior, build passes

**Phase 2** — Migrate high-value plugins:
- `tasks` / `tasks-core` (~15 endpoints)
- `conversations` (heavily fetched)
- `config` / `config_v2`

**Phase 3** — Remaining plugins migrate incrementally. Old hand-written handlers continue working indefinitely.

## Key files to create/modify

| File | Action |
|------|--------|
| `plugins/infra/plugins/endpoints/core/route-params.ts` | Create — template literal types + runtime URL helpers |
| `plugins/infra/plugins/endpoints/core/define-endpoint.ts` | Create — `defineEndpoint()` + `EndpointDef` type |
| `plugins/infra/plugins/endpoints/core/index.ts` | Create — barrel |
| `plugins/infra/plugins/endpoints/server/internal/implement.ts` | Create — `implement()` + `HttpError` |
| `plugins/infra/plugins/endpoints/server/index.ts` | Create — barrel (no ServerPluginDefinition needed, just exports) |
| `plugins/infra/plugins/endpoints/web/internal/fetch-endpoint.ts` | Create — `fetchEndpoint()` + `EndpointError` |
| `plugins/infra/plugins/endpoints/web/internal/use-endpoint.ts` | Create — `useEndpoint()` hook (wraps `useQuery`) |
| `plugins/infra/plugins/endpoints/web/internal/use-endpoint-mutation.ts` | Create — `useEndpointMutation()` hook (wraps `useMutation`) |
| `plugins/infra/plugins/endpoints/web/index.ts` | Create — barrel |
| `plugins/agents/core/endpoints.ts` | Create — agent endpoint definitions |
| `plugins/agents/server/internal/handle-get.ts` | Modify — use `implement()` |
| `plugins/agents/server/internal/handle-update.ts` | Modify — use `implement()` |
| `plugins/agents/server/internal/handle-delete.ts` | Modify — use `implement()` |
| `plugins/agents/server/index.ts` | Modify — use `[endpoint.route]` keys |
| `plugins/agents/web/components/agents-list.tsx` | Modify — use `fetchEndpoint()` |

## Verification

1. `./singularity build` — compiles and deploys
2. `./singularity check` — plugin boundaries pass (cross-plugin imports are legal via core/ barrel)
3. `curl http://<worktree>.localhost:9000/api/agents` — response unchanged
4. Send malformed body to PATCH → verify 400 with Zod issues
5. IDE hover on `fetchEndpoint(getAgent, { id: "x" })` → return type is `Promise<Agent>`
6. IDE error on `fetchEndpoint(getAgent, {})` → missing `id` param
