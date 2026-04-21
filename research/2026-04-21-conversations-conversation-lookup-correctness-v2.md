# Conversation Lookup Correctness — v2

> Supersedes v1. The key architectural revision: `recentConversationsResource` is a UI primitive for the conversations sidebar, renamed to `recentConversationsResource` to make the bounded nature self-evident. No plugin outside the conversations tree should subscribe to it.

## Context

Three plugins currently reach into `recentConversationsResource` for data that doesn't belong there:

| Plugin | What it needs | Why it's wrong |
|--------|---------------|----------------|
| `task-events.tsx` | conversations grouped by attemptId, with live status | The task domain already has attempts; conversation sessions are a property of an attempt |
| `agent-status.tsx` | latest conversation status for an agent's launch | The agents domain should own this; the bounded list fails for old conversations |
| `task-detail.tsx` (AuthorDisplay) | resolve conversation ID → taskId → task title | A point lookup; the bounded list is the wrong tool |

In addition, the `recentGone` slice is capped at 30 entries, so all three silently break for old conversations. And the `as Conversation[]` casts hide type errors when the payload shape changes (as just happened).

---

## Design principle

`recentConversationsResource` is a UI list for the sidebar. Its payload is intentionally bounded. **The only correct consumers are `conversations-view` (sidebar list) and `conversation-view` (navigation bar title — already handled by the existing `useConversation` hook).**

Other plugins that need conversation data should get it through:
- **Point lookups** → `GET /api/conversations/:id` (already exists)
- **Live status** → embedded in their own domain's resource

---

## Changes

### 0. Rename `conversationsResource` → `recentConversationsResource`

The current name implies "all conversations." The rename makes the bounded scope self-documenting — future code reading `useResource(recentConversationsResource)` immediately signals "this is a UI list, not a complete dataset."

Rename in all 16 files that reference it (server definition, shared descriptor, all consumers). This is a mechanical find-and-replace. The `ConversationListPayload` type name stays unchanged — it already describes the shape correctly.

After the rename the wrong usages in tasks/agents become even more obviously wrong at a glance, which is the point.

### 1. Conversations plugin: `useConversationById(id)` — pure REST point-lookup hook

A new public hook in `plugins/conversations/web/use-conversations.ts`, exported from `plugins/conversations/web/index.ts`.

- Does `GET /api/conversations/:id` via `useQuery(["conversation", id], ...)` with `staleTime: Infinity`
- Returns `ConversationEntry | null`
- No connection to `recentConversationsResource` — does not subscribe to the list
- Caches per ID in the shared React Query client; concurrent callers for the same ID are deduplicated automatically
- `staleTime: Infinity` is correct: a gone conversation's title won't change, and an active conversation's fields are not critical to be perfectly fresh in the AuthorDisplay context

Used by: `task-detail.tsx` (AuthorDisplay) and `conversation-view.tsx`.

### 2. Attempts resource: embed `conversations` per attempt

**Why this is the natural fit:** `attemptsResource` already declares `dependsOn: [recentConversationsResource]` in the server resource definition — meaning it already re-notifies whenever conversations change. The notification cascade is in place; the payload just hasn't been updated to carry conversation data yet.

**Server change** — `plugins/tasks-core/server/internal/`:

Change the `attemptsResource` loader from a bare `Attempt[]` to `AttemptWithConversations[]`. Each attempt entry gains a `conversations: ConversationSummary[]` field built by grouping the conversations query result by `attemptId`.

```
ConversationSummary = { id, title, status }
```

The loader can run `listActiveConversations()` + `listRecentGoneConversations(ALL)` (no limit — this is a server-side join, not a client push optimization) and group by attemptId. Or issue a single query: `SELECT id, attemptId, title, status FROM conversations_v ORDER BY createdAt ASC`. Since this loader only runs when attempts or conversations change, the cost is fine.

**Shared type** — add `ConversationSummary` and `AttemptWithConversations` to `plugins/tasks/shared/` (or `tasks-core/shared/`). The `ConversationStatus` type is already exported from `conversations/shared`, so the type import is valid.

**Client change** — `plugins/tasks/web/components/task-events.tsx`:
- Remove `useResource(recentConversationsResource)` entirely
- Change attempts data shape to `AttemptWithConversations[]`
- `conversationsByAttempt` memo becomes trivial: each attempt already carries `attempt.conversations`

### 3. Agent launches resource: embed `latestConversationStatus` per launch

**Server change** — `plugins/agents/server/internal/resources.ts`:

Extend `AgentLaunch` with `latestConversationStatus: ConversationStatus | null`. The loader LEFT JOINs to find the most recent conversation row for each launch's `taskId`.

Add `dependsOn: [recentConversationsResource]` so the resource re-notifies when any conversation status changes (same pattern as attemptsResource).

**Client change** — `plugins/agents/web/components/agent-status.tsx`:
- Remove `useResource(recentConversationsResource)` entirely
- Derive status from `agentLaunchesResource`: filter launches by `agentId`, get the most recent, read `latestConversationStatus`

### 4. `conversation-view.tsx`: use `useConversationById`

Replace `useConversation(sessionId)` with `useConversationById(sessionId)`. For the 99% case (conversation is active or recently gone) the hook finds it in the push-resource cache. For old conversations it falls back to a REST fetch. The null state becomes a brief loading flash rather than a permanent failure.

Keep `useConversation(id)` as-is (it searches the bounded list) — it's fine for the sidebar list context where the list already contains all needed entries.

### 5. Remove `as` casts

- `task-detail.tsx` line 69: `(data as Task[] | undefined)` → `data` (already typed as `Task[] | undefined` via phantom type on `tasksResource`)
- `task-dependencies.tsx` line 13: same
- `agent-detail.tsx` line 33: `(data as Agent[] | undefined)` → `data` (same reason)
- `task-detail.tsx` AuthorDisplay: the entire `useResource(recentConversationsResource)` + cast block goes away, replaced by `useConversationById(author)`
- `agent-status.tsx`: the entire `useResource(recentConversationsResource)` + cast block goes away

---

## Files to modify

**Server:**
- `plugins/conversations/shared/resources.ts` — rename export `conversationsResource` → `recentConversationsResource`
- `plugins/conversations/shared/index.ts` — update re-export
- `plugins/tasks-core/server/internal/resources.ts` — rename usage; extend attempts loader; add ConversationSummary grouping
- `plugins/tasks-core/server/internal/queries/conversations.ts` — add `listAllConversations()` (no limit) for the attempts loader
- `plugins/tasks/shared/resources.ts` — extend `Attempt` type with `conversations: ConversationSummary[]`; add `ConversationSummary` type
- `plugins/agents/server/internal/resources.ts` — extend launches loader; add `dependsOn`; join for `latestConversationStatus`
- `plugins/agents/shared/resources.ts` — extend `AgentLaunch` type with `latestConversationStatus`

**Client:**
- `plugins/conversations/web/use-conversations.ts` — add `useConversationById(id)` (pure REST, no list dep)
- `plugins/conversations/web/index.ts` — export `useConversationById`
- `plugins/conversations/plugins/conversation-view/web/components/conversation-view.tsx` — use `useConversationById`
- `plugins/tasks/web/components/task-events.tsx` — remove recentConversationsResource; use attempt.conversations
- `plugins/tasks/web/components/task-detail.tsx` — AuthorDisplay uses `useConversationById`; remove casts
- `plugins/tasks/web/components/task-dependencies.tsx` — remove `as Task[]` cast
- `plugins/agents/web/components/agent-status.tsx` — remove recentConversationsResource; derive from launches
- `plugins/agents/web/components/agent-detail.tsx` — remove `as Agent[]` cast

---

## What does not change

- `recentConversationsResource` payload shape — unchanged
- `RECENT_GONE_LIMIT = 30` — unchanged; the bounded list is correct for the sidebar
- `GET /api/conversations/:id` — already exists, no changes
- `conversations-view` sidebar and `conversation-view` — only cosmetic change (useConversationById for the latter)

---

## Verification

1. Open `task-events.tsx` for a task with old attempts. Conversation links render correctly.
2. Navigate to `/c/:id` for a conversation older than 30 gone entries. Title renders, not the raw session ID.
3. Open `AuthorDisplay` for a task authored by an old conversation. Shows the task title, not the raw ID.
4. `AgentStatus` dot renders correctly for active agents without any `recentConversationsResource` subscription.
5. Network tab: `GET /api/conversations/:id` fires at most once per ID per session; not at all for conversations in the push payload.
6. `tsc --noEmit` passes with no cast-related errors.
7. Grep for `recentConversationsResource` in `plugins/tasks/` and `plugins/agents/` — zero results.
8. Grep for `conversationsResource` anywhere in `plugins/` — zero results (fully renamed).
