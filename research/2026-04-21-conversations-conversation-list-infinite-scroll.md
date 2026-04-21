# Conversations — Infinite Scroll Pagination in Sidebar

## Context

The conversation list sidebar currently loads every conversation via a push-mode WebSocket resource (`conversations` key). The server loader issues an unbounded `SELECT * FROM conversations_v ORDER BY created_at DESC`. As the number of conversations grows this becomes a scaling problem: every DB mutation sends the entire list to every connected tab.

The goal is to:
1. Keep active conversations (`status !== 'gone'`) fully loaded and real-time at all times.
2. Lazily load gone conversations via infinite scroll as the user scrolls down the sidebar.
3. Eliminate any flicker when a conversation transitions active → gone.
4. Preserve the existing sort order (active first by recency, then gone by recency).

The key architectural challenge is the active → gone transition. If active and gone conversations were served by independent queries there would be an async gap where the conversation momentarily disappears from both lists. The solution is a "live window" — the push resource atomically returns all active conversations plus the N most-recently-gone, so transitions happen within a single React render cycle.

---

## Design

### 1. New resource payload shape

Change the `conversations` push resource from returning a flat `Conversation[]` to returning a structured payload:

```ts
// plugins/conversations/shared/resources.ts
export type ConversationListPayload = {
  active: ConversationEntry[];      // all active, DESC by createdAt
  recentGone: ConversationEntry[];  // up to RECENT_GONE_LIMIT most-recent gone
  hasMoreGone: boolean;             // true when total gone > RECENT_GONE_LIMIT
};
```

`RECENT_GONE_LIMIT = 30` is a module-level constant in the server query file. The value comfortably covers what is visible in the sidebar without scrolling while keeping WS payload sizes small.

To detect `hasMoreGone` without a COUNT query, fetch `RECENT_GONE_LIMIT + 1` rows. If the result length exceeds the limit, truncate to `RECENT_GONE_LIMIT` and set `hasMoreGone = true`.

The `conversationsResource` descriptor in `plugins/conversations/shared/resources.ts` changes its phantom type parameter from `ConversationEntry[]` to `ConversationListPayload`. This is a zero-runtime change to the descriptor.

### 2. DB query layer

Add three new query functions in `plugins/tasks-core/server/internal/queries/conversations.ts`:

```ts
// All active (status <> 'gone'), DESC
export async function listActiveConversations(): Promise<Conversation[]>

// RECENT_GONE_LIMIT + 1 most-recent gone, for hasMore detection
export async function listRecentGoneConversations(limit: number): Promise<Conversation[]>

// Cursor-based page of gone conversations older than `before`
// Returns limit + 1 rows for hasMore detection
export async function listGoneConversationsBefore(
  before: Date,
  limit: number,
): Promise<Conversation[]>
```

Each uses `eq` / `lt` on the `active` computed column (which is `status <> 'gone'` in the view). The cursor for `listGoneConversationsBefore` is `createdAt < before` — simple, index-friendly, and stable.

Keep the existing `listConversations()` untouched; it backs the existing `GET /api/conversations` HTTP route.

### 3. Push resource loader

Update `plugins/tasks-core/server/internal/resources.ts`:

```ts
export const conversationsResource = defineResource({
  key: "conversations",
  mode: "push",
  loader: async (): Promise<ConversationListPayload> => {
    const LIMIT = RECENT_GONE_LIMIT;
    const [active, goneRows] = await Promise.all([
      listActiveConversations(),
      listRecentGoneConversations(LIMIT),
    ]);
    const hasMoreGone = goneRows.length > LIMIT;
    return {
      active,
      recentGone: hasMoreGone ? goneRows.slice(0, LIMIT) : goneRows,
      hasMoreGone,
    };
  },
});
```

The two DB queries run in parallel. The resource notifier fires on every conversation mutation via the existing poller — no change needed there.

### 4. New REST endpoint for paginated gone conversations

```
GET /api/conversations/gone?before=<ISO timestamp>&limit=<N>
→ { items: Conversation[], hasMore: boolean }
```

Register in `plugins/conversations/server/index.ts` **before** `GET /api/conversations/:id` to prevent the `:id` wildcard from matching `"gone"`.

The handler (`plugins/conversations/server/internal/handle-list-gone.ts`):
1. Parses `before` as an ISO date string (400 if missing or invalid).
2. Parses `limit` as an integer, clamped to `[1, 50]`, defaulting to 20.
3. Calls `listGoneConversationsBefore(before, limit)` which fetches `limit + 1` rows.
4. Returns `{ items: rows.slice(0, limit), hasMore: rows.length > limit }`.

### 5. Shared types

`plugins/conversations/shared/resources.ts` gains `ConversationListPayload` and updates the descriptor type:

```ts
export type ConversationListPayload = {
  active: ConversationEntry[];
  recentGone: ConversationEntry[];
  hasMoreGone: boolean;
};

export const conversationsResource = descriptor<ConversationListPayload>("conversations");
```

No runtime code changes — only the phantom type annotation on the descriptor.

### 6. Hook changes

`plugins/conversations/web/use-conversations.ts` returns the split structure:

```ts
export function useConversations(): {
  active: ConversationEntry[];
  recentGone: ConversationEntry[];
  hasMoreGone: boolean;
  isLoading: boolean;
}
```

Parse the incoming payload with a Zod schema mirroring `ConversationListPayload`.

`useConversation(id)` searches both `active` and `recentGone`:

```ts
export function useConversation(id: string): ConversationEntry | null {
  const { active, recentGone } = useConversations();
  return useMemo(
    () => [...active, ...recentGone].find((c) => c.id === id) ?? null,
    [active, recentGone, id],
  );
}
```

### 7. ConversationList component

Restructure `plugins/conversations/plugins/conversations-view/web/components/conversation-list.tsx` into three rendering sections:

**Section A — Active (live window):** `active` from the push resource. Always present, real-time.

**Section B — Recent gone (live window):** `recentGone` from the push resource. Rendered immediately below active. An active→gone transition moves a conversation from A to B atomically in the same React render — zero flicker.

**Section C — Paginated gone (infinite scroll):** Only mounted when `hasMoreGone` is true. Uses `useInfiniteQuery` (TanStack Query, already in the project) to fetch pages from `GET /api/conversations/gone`.

Remove the CSS `order` trick (`style={{ order: conversation.active ? 0 : 1 }}`); the three sections replace it.

#### Cursor stability

Capture the initial cursor in a `useRef` the first time the component mounts with `hasMoreGone === true`:

```ts
const cursorRef = useRef<string | null>(null);
if (hasMoreGone && recentGone.length > 0 && cursorRef.current === null) {
  cursorRef.current = recentGone.at(-1)!.createdAt.toISOString();
}
```

Pass `cursorRef.current` as the first `pageParam` to `useInfiniteQuery`. Never update `cursorRef` after initial assignment — this keeps the infinite query's page chain stable even as `recentGone` updates in real-time.

#### IntersectionObserver sentinel

```ts
const sentinelRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!sentinelRef.current) return;
  const obs = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  });
  obs.observe(sentinelRef.current);
  return () => obs.disconnect();
}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

// In JSX, at end of section C:
<div ref={sentinelRef} />
```

`SidebarContent` has `overflow-auto` (confirmed at `web/src/components/ui/sidebar.tsx:374`), so IntersectionObserver works without additional scroll container configuration.

#### Deduplication

Filter paginated results to exclude IDs already in the live window:

```ts
const liveIds = useMemo(
  () => new Set([...active, ...recentGone].map((c) => c.id)),
  [active, recentGone],
);

const paginatedItems = pages.flatMap((p) => p.items).filter((c) => !liveIds.has(c.id));
```

#### useInfiniteQuery configuration

```ts
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: ["conversations-gone-paginated", cursorRef.current],
  queryFn: async ({ pageParam }) => {
    const params = new URLSearchParams({ before: pageParam as string, limit: "20" });
    const res = await fetch(`/api/conversations/gone?${params}`);
    if (!res.ok) throw new Error("Failed to fetch gone conversations");
    return res.json() as Promise<{ items: ConversationEntry[]; hasMore: boolean }>;
  },
  initialPageParam: cursorRef.current,
  getNextPageParam: (lastPage) =>
    lastPage.hasMore ? lastPage.items.at(-1)?.createdAt.toISOString() : undefined,
  enabled: hasMoreGone && cursorRef.current !== null,
  staleTime: Infinity,
});
```

`staleTime: Infinity` — consistent with how `useResource` configures queries. Paginated gone conversations are stable; the WS push is the source of truth for recency.

### 8. Breaking change: `useConversations()` callers

The hook's return type changes. Two callers outside `conversation-list.tsx`:

**`plugins/welcome/web/components/welcome-view.tsx`** — uses a flat conversations array for stats. Derive it:

```ts
const { active, recentGone } = useConversations();
const conversations = [...active, ...recentGone];
```

Existing `.filter((c) => c.active)` and `.slice(0, 5)` logic works unchanged.

No other callers found — `useConversations` is used in exactly 4 files: its definition, its barrel export, `conversation-list.tsx`, and `welcome-view.tsx`.

---

## Files to Change

| File | Change |
|---|---|
| `plugins/tasks-core/server/internal/queries/conversations.ts` | Add `listActiveConversations`, `listRecentGoneConversations`, `listGoneConversationsBefore` |
| `plugins/tasks-core/server/internal/resources.ts` | Update `conversationsResource` loader to return `ConversationListPayload` |
| `plugins/conversations/shared/resources.ts` | Add `ConversationListPayload` type; update descriptor phantom type |
| `plugins/conversations/web/use-conversations.ts` | Parse `ConversationListPayload`; update `useConversation` to search both arrays |
| `plugins/conversations/server/index.ts` | Register `GET /api/conversations/gone` before `GET /api/conversations/:id` |
| `plugins/conversations/server/internal/handle-list-gone.ts` | New file: paginated gone handler |
| `plugins/conversations/plugins/conversations-view/web/components/conversation-list.tsx` | Three-section render; `useInfiniteQuery` + IntersectionObserver; remove CSS order trick |
| `plugins/welcome/web/components/welcome-view.tsx` | Derive flat array from `active + recentGone` |

---

## Verification

**No-flicker transition.** Create a conversation, let it go `gone`. The item must move from the active section to the recent-gone section without disappearing or jumping. Verify in the network tab that a single WS frame triggers the re-render (not two separate fetches).

**Infinite scroll loads.** Create > 30 gone conversations. The sidebar must initially show only `recentGone`. Scrolling to the bottom must trigger `GET /api/conversations/gone?before=...&limit=20` and append results.

**Cursor stability.** While scrolled partway into paginated gone items, trigger a new conversation push. The paginated section must not reset or reload from the beginning.

**Deduplication.** Cause a push update that shifts the boundary between `recentGone` and paginated pages (create the 31st gone conversation). The boundary item must appear exactly once in the list.

**Welcome view.** Stats (Total, Active, Idle) and the recent-conversations list must display correctly using `active + recentGone`.

**Route ordering.** `GET /api/conversations/gone` must not be matched by the `:id` wildcard. Confirm the handler registration order in `plugins/conversations/server/index.ts`.
