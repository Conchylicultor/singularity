# Conversation Lookup Correctness

## Context

The `conversationsResource` push payload is intentionally bounded: it returns all active conversations plus the 30 most recent gone ones (`RECENT_GONE_LIMIT = 30`). This is correct for rendering the sidebar list — you don't want to push unbounded history to every client.

The bug is that **point lookups by ID also search only this bounded payload**. Any conversation older than the 30 most recent gone entries returns `null` everywhere, causing:

- `/c/:id` navigation — `useConversation(id)` returns null → conversation-view shows the raw session ID as the title
- `AuthorDisplay` in task-detail — crashes (`n.find is not a function`) because of an `as Conversation[]` cast on the object payload; even when fixed, old conversations silently degrade to showing the raw ID
- `task-events.tsx` — attempt→conversation links silently missing for old tasks
- `agent-status.tsx` — same `as Conversation[]` crash

**Root principle:** a push resource is a live list optimised for rendering lists. It is the wrong tool for point lookups. Point lookups by ID belong to a dedicated fetch path.

The server already has `GET /api/conversations/:id`. No server changes are needed.

---

## Design

### Two new hooks in `use-conversations.ts`

**`useConversationsMap(): Map<string, ConversationEntry>`**

Derives a `Map<id, ConversationEntry>` from `active + recentGone` in a single `useMemo`. Replaces all inline `[...active, ...recentGone].find(c => c.id === id)` patterns with O(1) lookups, and gives a consistent construction point for the bounded cache.

**`useConversationById(id: string): ConversationEntry | null`**

The correct point-lookup hook:

1. Checks `useConversationsMap()` first — zero network cost for recent conversations (the common case).
2. If not found, fires `useQuery(["conversation-by-id", id], GET /api/conversations/:id)` with `staleTime: Infinity`.
   - React Query deduplicates concurrent fetches and caches the result for the session lifetime.
   - `staleTime: Infinity` is correct: a gone conversation's title will not change again, and if it somehow becomes active again the push resource will override anyway.
   - The `["conversation-by-id", id]` key is namespaced away from resource push keys so push invalidations never evict these entries.
3. Returns `ConversationEntry | null`. During the first fetch for an unknown ID the hook returns `null` (loading state), then resolves on the next render.

**Update `useConversation(id)`** to delegate to `useConversationById(id)` — preserves the existing public API.

`useQuery` used inside `useConversationById` shares the same `QueryClient` as `useResource` because both live inside the same `NotificationsProvider → QueryClientProvider` tree. No new providers needed.

---

## Changes

### `plugins/conversations/web/use-conversations.ts`
- Add `useConversationsMap()` — memoized `Map<string, ConversationEntry>` over `active + recentGone`.
- Add `useConversationById(id: string)` — map check → `useQuery` fallback as described above.
- Update `useConversation(id)` to delegate to `useConversationById(id)`.

### `plugins/conversations/web/index.ts`
- Export `useConversationById` and `useConversationsMap`.

### `plugins/conversations/plugins/conversation-view/web/components/conversation-view.tsx`
- Replace `useConversation(sessionId)` with `useConversationById(sessionId)`.
- No other changes — the null fallback already renders `sessionId` as title; with the new hook this becomes a transient loading state rather than a permanent failure.

### `plugins/tasks/web/components/task-detail.tsx`
- **`AuthorDisplay`**: replace `useResource(conversationsResource)` + `as ConversationListPayload` cast with a direct call to `useConversationById(author)` (guard `author === "user"` as before). The `convsData`/`tasksData` variables and their casts go away entirely.
- **`TaskDetail` body (line 69)**: remove `as Task[] | undefined` cast — `useResource(tasksResource).data` is already typed as `Task[] | undefined` via the phantom type on `tasksResource`.

### `plugins/tasks/web/components/task-dependencies.tsx`
- Remove `data as Task[] | undefined` cast (line 13) — same reason as above; the type is already inferred correctly.

### `plugins/tasks/web/components/task-events.tsx`
- Replace direct `useResource(conversationsResource)` + inline payload destructuring with `useConversationsMap()`.
- The `conversationsByAttempt` memo iterates the map values instead of a raw array. Logic is otherwise identical.
- Note: old attempt→conversation links remain absent if those conversations have never been individually fetched. This is acceptable for the events list; a full fix would require a batch endpoint or per-attempt hooks, which violates React's rules-of-hooks constraint. The improvement over the current state is: any conversation previously resolved via `useConversationById` (e.g., from opening its conversation view) will now appear here too, since both hooks share the same React Query cache.

### `plugins/agents/web/components/agent-status.tsx`
- Replace `useResource(conversationsResource)` + `as Conversation[]` cast with `useConversationsMap()`.
- Find the latest conversation for the agent's task by iterating map values (wrap in `useMemo`).

### `plugins/agents/web/components/agent-detail.tsx`
- Remove `as Agent[] | undefined` cast on line 33 — `useResource(agentsResource).data` is already typed as `Agent[] | undefined`.

---

## What does not change

- Server: no changes. `GET /api/conversations/:id` already exists.
- `ConversationListPayload` shape: stays as `{ active, recentGone, hasMoreGone }`.
- `RECENT_GONE_LIMIT = 30`: stays. The push list is correctly bounded.
- The gone-conversations infinite scroll in the sidebar: unaffected.

---

## Verification

1. Navigate to a conversation older than 30 gone entries via `/c/:id` (copy the URL from the sidebar before it scrolls off). Verify the title renders correctly, not the raw session ID.
2. Open `TaskDetail` for a task whose `author` is an old conversation ID. Verify `AuthorDisplay` shows the task title rather than the raw ID.
3. Confirm `GET /api/conversations/:id` is called at most once per unknown ID per session (Network tab — no duplicate fetches for the same ID).
4. Confirm `GET /api/conversations/:id` is NOT called for conversations already in the push payload (Network tab — common case is cache-only).
5. Verify `task-events.tsx` still shows conversation links for recent attempts.
6. Verify `agent-status.tsx` still renders the status dot for agents with active conversations.
7. `tsc --noEmit` passes with no cast-related errors across the modified files.
