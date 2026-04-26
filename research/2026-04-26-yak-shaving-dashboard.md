# Yak-shaving dashboard plugin

## Context

The agent currently runs many parallel conversations across multiple threads of work (events system, sync engine, UI polish, crashes — see `research/2026-04-26-conversations-yak-shaving-tree.md`). Reconstructing *what was I trying to do, and how did I end up here?* requires manually walking task ancestry, reading first user turns, and building a mental tree.

This plan introduces a `yak-shaving` plugin that maintains a persisted tree of conversations annotated with one-line context, status, and next-action. A small Sonnet model populates and curates the tree. Clicking a node opens that conversation in a right-side pane.

**Scope note from the user**: this is a complex feature and ships as a sequence of independent sub-tasks (A → G below). Each sub-task is reviewable and mergeable on its own.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  /yak  (yakShavingPane)                                             │
│  ┌──────────────────────────┬───────────────────────────────────┐   │
│  │  Tree (left)             │  Conversation (right, Outlet)     │   │
│  │  ─ status dot            │                                   │   │
│  │  ─ title                 │  reuses ConversationView          │   │
│  │  ─ one-line context      │  from conversation-view plugin    │   │
│  │  ─ next-action + regen   │                                   │   │
│  └──────────────────────────┴───────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

Server flows:
- conversation.created event   →  classify-conversation job (Sonnet conv)
- POST /api/yak/rebuild         →  rebuild-tree job (Sonnet conv)
- POST /api/yak/nodes/:id/regen →  regen-next-action job (Sonnet conv)

Each job:
1. Builds a context payload
2. createConversation({ model: "sonnet", spawnedBy: "yak-shaving", taskId: <meta>, prompt })
3. ctx.waitFor(conversationTurnCompleted, { where: { conversationId } })
4. Sonnet has called yak_* MCP tools mid-turn → table is updated
5. ctx.step: mark the classifier conversation's task as `dropped` (kept for debugging, hidden in UI)
```

---

## Sub-tasks (ship independently)

### A. `conversation.created` trigger event (in `conversations` plugin)

- New file `plugins/conversations/server/internal/tables-created-event.ts`:
  ```typescript
  export const { event: conversationCreated, table: _conversationCreatedTriggers } =
    defineTriggerEvent<ConversationCreatedPayload>({
      name: "conversation.created",
      filters: { conversationId: text("conversation_id") },
    });
  ```
- Payload shape:
  ```typescript
  type ConversationCreatedPayload = {
    conversationId: string;
    taskId: string;
    model: ConversationModel;
    spawnedBy: string;
    createdAt: string;
  };
  ```
- Emit from `createConversation()` in `plugins/conversations/server/internal/lifecycle.ts` after the conversation row is inserted (mirror the existing `conversationTurnCompleted` emit pattern from `tables-turn-completed-event.ts`).
- Re-export from `plugins/conversations/server/index.ts` alongside `conversationTurnCompleted`.

This sub-task is independently useful (other future plugins can subscribe). No UI.

### B. Yak-shaving plugin scaffolding

- Files to create:
  - `plugins/yak-shaving/package.json`, `web/index.ts`, `server/index.ts`, `shared/resources.ts`
  - `plugins/yak-shaving/server/internal/tables.ts` (see Schema below)
  - `plugins/yak-shaving/server/internal/resources.ts`
  - `plugins/yak-shaving/server/internal/queries.ts`
  - `plugins/yak-shaving/web/panes.tsx`
  - `plugins/yak-shaving/web/components/yak-tree.tsx` (placeholder)
  - `plugins/yak-shaving/web/components/yak-root.tsx`
- Sidebar entry:
  ```typescript
  Shell.Sidebar({
    title: "Yak",
    icon: MdAccountTree, // from react-icons/md
    group: "System",
    onClick: () => yakShavingPane.open({}),
  })
  ```
- Register `yakShavingPane` (left + outlet) and `yakShavingConversationPane` (child).
- Register the plugin in `web/src/plugins.ts` and `server/src/plugins.ts`.
- Register in `docs/plugins.md` (the `plugins-doc-in-sync` check enforces this).
- Add `task-meta-yak-shaving` constant via `ensureMetaTask` in server init (mirrors agents plugin).

After this sub-task: empty dashboard renders, sidebar entry works, table exists. No data flows yet.

### C. TreeList enhancement: `renderLabel`

The user wants dense rows (status + title + one-line context + next-action + regen button). Today `TreeList`'s API is:

```
labelOf: (row) => string
renderLeading?: (row) => ReactNode      // before label
renderActions?: (row, ctx) => ReactNode // right edge
```

Add one prop:

```
renderLabel?: (row: T) => ReactNode     // replaces default <span>{labelOf(row)}</span>
```

Edit `plugins/tree/web/internal/tree-list.tsx`. `labelOf` stays mandatory (used for accessibility/search/rename UX). When `renderLabel` is provided, it owns the label area visually. This is a surgical addition; existing callers (`agents`, `tasks`) remain unchanged.

### D. MCP tools for yak-shaving

Register in `plugins/yak-shaving/server/internal/mcp-tools.ts`. **Exact API is TBD with the user** — the proposal below is a starting point. Each tool ends with `return { content: [{ type: "text", text: "ok" }] }`.

| Tool | Args | Effect |
|---|---|---|
| `yak_clear_tree` | none | Delete all rows in `_yak_shaving_nodes`. Used at the start of full rebuild. |
| `yak_upsert_node` | `conversationId`, `parentConversationId` (nullable), `oneLineContext` (≤ 200 chars), `status` (`"ready" \| "blocked" \| "working"`, optional) | Insert or update node. `parentConversationId` is resolved server-side to a `parent_node_id`. |
| `yak_set_next_action` | `conversationId`, `nextAction` (≤ 200 chars) | Set the `next_action` field. Used by the per-node regen flow. |
| `yak_remove_node` | `conversationId` | Delete a node. (For when the model decides a conversation no longer belongs.) |

Why parents are addressed by `conversationId` rather than `nodeId`: the model already reasons in conversation IDs (it sees them in the prompt). Resolving to internal node IDs server-side keeps the tool surface natural for the model.

### E. "Rebuild tree" button + full-rebuild job

- Toolbar button in the yak pane header: `<button onClick={() => fetch('/api/yak/rebuild', { method: 'POST' })}>Rebuild</button>`.
- Server route enqueues `rebuildTreeJob`.
- Job (`plugins/yak-shaving/server/internal/jobs/rebuild-tree.ts`):
  ```typescript
  export const rebuildTreeJob = defineJob({
    name: "yak.rebuild_tree",
    input: z.object({}),
    maxAttempts: 1,
    run: async (_, ctx) => {
      const payload = await ctx.step("build-payload", buildRebuildPayload);
      const convId = await ctx.step("create-conv", () =>
        createConversation({
          model: "sonnet",
          taskId: YAK_META_TASK_ID,
          spawnedBy: "yak-shaving",
          prompt: payload,
        }).then((c) => c.id),
      );
      await ctx.waitFor(conversationTurnCompleted, {
        where: { conversationId: convId },
        timeoutMs: 600_000,
      });
      await ctx.step("drop-task", () => markConversationTaskDropped(convId));
    },
  });
  ```
- `buildRebuildPayload()` lives in `server/internal/queries.ts` and assembles:
  - List of all active conversations (`recentConversationsResource`-equivalent server query)
  - First user turn for each (`readConversationTurns(id).then(t => t.find(x => x.role === "user"))`)
  - Task ancestor chain per conversation (walk `parentId` via `getTask`)
  - Instructions: "Use yak_clear_tree, then call yak_upsert_node for each conversation. Identify chains, blockers, scope creep."
- The Sonnet conversation calls the MCP tools mid-turn; node table is up-to-date when `waitFor` resolves.
- After landing: clicking "Rebuild" re-derives the tree.

### F. On-create auto-classifier

- Bind `conversationCreated` → `classifyConversationJob` at server init:
  ```typescript
  await trigger({ on: conversationCreated, do: classifyConversationJob });
  ```
- Job (`plugins/yak-shaving/server/internal/jobs/classify-conversation.ts`):
  ```typescript
  export const classifyConversationJob = defineJob({
    name: "yak.classify_conversation",
    input: z.object({ conversationId: z.string() }),
    maxAttempts: 3,
    run: async ({ conversationId }, ctx) => {
      // Bail on system conversations to prevent recursion.
      const conv = await getConversation(conversationId);
      if (conv?.spawnedBy === "yak-shaving") return;

      const payload = await ctx.step("build-payload", () => buildClassifyPayload(conversationId));
      const classifierId = await ctx.step("create-conv", () =>
        createConversation({
          model: "sonnet",
          taskId: YAK_META_TASK_ID,
          spawnedBy: "yak-shaving",
          prompt: payload,
        }).then((c) => c.id),
      );
      await ctx.waitFor(conversationTurnCompleted, {
        where: { conversationId: classifierId },
        timeoutMs: 300_000,
      });
      await ctx.step("drop-task", () => markConversationTaskDropped(classifierId));
    },
  });
  ```
- `buildClassifyPayload(convId)` includes:
  - The new conversation's first user turn + task ancestor chain
  - The current tree (existing rows in `_yak_shaving_nodes`, joined with conversation titles)
  - Instructions: "Call yak_upsert_node once. Pick parentConversationId from the existing tree if it fits; null for a new root."
- **Recursion guard**: `spawnedBy === "yak-shaving"` short-circuits at job entry.
- The `conversationCreated` event fires for the classifier's own conversation (since it's also a conversation). The early-return prevents the loop. We could additionally use `match` on the trigger to filter at the SQL layer, but bail-early is simpler and sufficient.

### G. Per-node "Regenerate next action"

- Button in each tree row (right edge via `renderActions`).
- POST `/api/yak/nodes/:nodeId/regenerate-next-action`.
- `regenNextActionJob` mirrors classify, but:
  - Payload: target node's conversation transcript (full or truncated) + tree position
  - Single MCP tool the model is asked to call: `yak_set_next_action`
- After it lands: clicking regen on a row fills the next-action column.

---

## Schema (sub-task B)

`plugins/yak-shaving/server/internal/tables.ts`:

```typescript
import { pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const _yakShavingNodes = pgTable(
  "yak_shaving_nodes",
  {
    id: text("id").primaryKey(),                  // "yak-<cuid>"
    conversationId: text("conversation_id").notNull(),  // soft FK to conversations.id
    parentNodeId: text("parent_node_id"),         // self-FK; null for root
    oneLineContext: text("one_line_context"),     // model-generated, ≤ 200 chars
    nextAction: text("next_action"),              // model-generated, manual regen only
    status: text("status"),                       // "ready" | "blocked" | "working" | null
    rank: text("rank"),                           // sibling ordering (use nextRankUnder pattern)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("yak_shaving_nodes_conv_idx").on(t.conversationId),
    index("yak_shaving_nodes_parent_idx").on(t.parentNodeId),
  ],
);
```

Notes:
- `conversationId` is a *soft* FK (no `.references()`) per the cross-plugin convention.
- `UNIQUE(conversation_id)` enforces one node per conversation.
- No FK from `parent_node_id` to `id` either (kept soft for symmetry; cycles prevented in code).
- Conversation status (`working`/`waiting`) is derived live from the conversations resource — not duplicated here. The `status` column captures **model-derived flags** (e.g. "blocked").

---

## UI (sub-task B + C + E)

### Pane structure (`plugins/yak-shaving/web/panes.tsx`)

```typescript
export const yakShavingPane = Pane.define({
  id: "yak-shaving",
  path: "/yak",
  component: YakShavingRoot,
});

export const yakShavingConversationPane = Pane.define({
  id: "yak-shaving-conversation",
  parent: yakShavingPane,
  path: "c/:convId",
  component: YakShavingConversationView,
});
```

### Layout (`web/components/yak-root.tsx`)

Mirrors `plugins/tasks/web/panes.tsx` and `plugins/attempt-view/web/panes.tsx`:

```tsx
function YakShavingRoot() {
  const match = usePaneMatch();
  const selectedConvId = match?.chain.find(
    (e) => e.pane === yakShavingConversationPane._internal,
  )?.params.convId;

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={45} minSize={25}>
        <YakHeader /> {/* "Rebuild" button + count */}
        <YakTree selectedId={selectedConvId} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={55} minSize={25}>
        {selectedConvId ? <Outlet /> : <EmptyState />}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
```

`YakShavingConversationView` reuses the existing `<ConversationView convId={...}/>` component from `plugins/conversations/plugins/conversation-view/web` — same approach as `attempt-view`.

### Tree row (`web/components/yak-tree.tsx`)

Uses the enhanced `TreeList` (sub-task C) with `renderLabel`:

```tsx
<TreeList
  rows={nodes}
  selectedId={selectedConvId}
  labelOf={(n) => n.title}
  onSelect={(convId) => yakShavingConversationPane.open({ convId })}
  renderLeading={(n) => <StatusDot status={n.status} convStatus={n.convStatus} />}
  renderLabel={(n) => (
    <div className="flex flex-col">
      <span className="font-medium">{n.title}</span>
      <span className="text-muted-foreground text-xs">{n.oneLineContext}</span>
      {n.nextAction && (
        <span className="text-xs italic">Next: {n.nextAction}</span>
      )}
    </div>
  )}
  renderActions={(n) => <RegenerateNextActionButton nodeId={n.id} />}
  onRename={noop}
  onToggleExpanded={noop}
  onMove={noop}
  onCreate={noopCreate}
/>
```

Status dot rules:
- Conversation `working` → blue pulsing dot (existing `CONV_STATUS_DOT` constant)
- Conversation `waiting` + node status `blocked` → red dot
- Conversation `waiting` + node status `ready` → green dot
- Otherwise → grey dot

The `nodes` array is built by joining the `yakShavingNodesResource` with the live `recentConversationsResource` so the dot reacts to status changes without a model round-trip.

### Resource

```typescript
// plugins/yak-shaving/server/internal/resources.ts
export const yakShavingNodesResource = defineResource({
  key: "yak-shaving-nodes",
  mode: "push",
  loader: () => db.select().from(_yakShavingNodes).orderBy(asc(_yakShavingNodes.createdAt)),
});
```

The job's `step` calls (and the MCP tools) call `yakShavingNodesResource.notify()` after writes.

---

## Critical files to modify or create

| Sub-task | Path | Change |
|---|---|---|
| A | `plugins/conversations/server/internal/tables-created-event.ts` | new |
| A | `plugins/conversations/server/internal/lifecycle.ts` | emit event |
| A | `plugins/conversations/server/index.ts` | re-export `conversationCreated` |
| B | `plugins/yak-shaving/{package.json,web/index.ts,server/index.ts,shared/resources.ts}` | new |
| B | `plugins/yak-shaving/server/internal/{tables.ts,resources.ts,queries.ts}` | new |
| B | `plugins/yak-shaving/web/{panes.tsx,components/yak-root.tsx,components/yak-tree.tsx}` | new |
| B | `web/src/plugins.ts`, `server/src/plugins.ts`, `docs/plugins.md` | register |
| C | `plugins/tree/web/internal/tree-list.tsx` | add `renderLabel` prop |
| D | `plugins/yak-shaving/server/internal/mcp-tools.ts` | new |
| E | `plugins/yak-shaving/server/internal/jobs/rebuild-tree.ts` | new |
| E | `plugins/yak-shaving/server/{routes,index.ts}` | `POST /api/yak/rebuild` |
| F | `plugins/yak-shaving/server/internal/jobs/classify-conversation.ts` | new |
| F | `plugins/yak-shaving/server/index.ts` | `trigger({ on: conversationCreated, ... })` at init |
| G | `plugins/yak-shaving/server/internal/jobs/regen-next-action.ts` | new |
| G | `plugins/yak-shaving/web/components/regenerate-next-action-button.tsx` | new |

---

## Existing utilities reused

- `Pane.define`, `Outlet`, `usePaneMatch` — `plugins/pane/web/index.ts`
- `Shell.Sidebar` — `plugins/shell/web/slots.ts`
- `TreeList` — `plugins/tree/web/internal/tree-list.tsx` (extended with `renderLabel`)
- `defineSlot`, plugin barrel/contributions — pattern from `plugins/tasks/web/index.ts`
- `defineTriggerEvent`, `trigger`, `triggerByName` — `plugins/events/server`
- `defineJob`, `ctx.step`, `ctx.waitFor` — `plugins/jobs/server`
- `Mcp.registerTool` — `plugins/mcp/server`; usage example in `plugins/tasks/server/internal/mcp-tools.ts`
- `createConversation`, `sendTurn`, `readConversationTurns`, `conversationTurnCompleted` — `plugins/conversations/server`
- `ensureMetaTask`, `getTask`, `getConversation`, `recentConversationsResource` — `plugins/tasks-core/server`
- `defineResource` (push mode) — pattern from `plugins/tasks-core/server/internal/resources.ts`
- `ResizablePanelGroup`, `ConversationView` — referenced from `plugins/attempt-view/web/panes.tsx`

---

## Open questions / follow-ups

1. **MCP tool surface (sub-task D)**: the proposed `yak_upsert_node` / `yak_set_next_action` / `yak_clear_tree` / `yak_remove_node` is a starting point. Refine before sub-task D ships — particularly whether `parentConversationId` (model-friendly) or `parentNodeId` (server-friendly) is the canonical addressing.
2. **Idempotency on rebuild**: `yak_clear_tree` followed by per-node upserts is destructive between calls. Consider wrapping the rebuild job in a transaction so a partially-completed Sonnet turn doesn't leave a half-empty tree. (Lower priority — `maxAttempts: 1` reduces the risk.)
3. **Cross-namespace view**: each worktree has its own DB, so the dashboard is per-namespace. Future work could aggregate across namespaces; out of scope.
4. **Filter at trigger SQL level**: today the design relies on `spawnedBy === "yak-shaving"` bail-early in the classifier job. If we ever add many system-spawned conversations, switching to `match: (table, payload) => sql\`payload.spawnedBy != 'yak-shaving'\`` may be cheaper. Defer.
5. **What "blocked" means concretely**: status enum values (`ready`, `blocked`, `working`) are defined here but the model decides them from prompt content. We may want a Settings field with a system prompt that documents how to choose.

---

## Verification

After each sub-task:

- **A**: confirm `conversation.created` shows up in `_event_emissions` after `POST /api/conversations`. Check via the events debug pane (`Debug` → `Queue`).
- **B**: open `http://<worktree>.localhost:9000/yak` — empty dashboard renders, sidebar entry exists. Migrations land cleanly via `./singularity build`. `./singularity check` passes (including `plugins-doc-in-sync`).
- **C**: existing `agents` and `tasks` lists render unchanged.
- **D**: hit each MCP tool from the MCP debug surface (or via a probe conversation) and verify `_yak_shaving_nodes` updates.
- **E**: with several active conversations, click "Rebuild" → wait ~30 s → tree populates with one-line contexts and (mostly correct) parent edges. Inspect the classifier conversation under `task-meta-yak-shaving` (status `dropped`).
- **F**: run `POST /api/conversations` to create a new conversation → within ~30 s a node appears for it. The classifier conversation lands as `dropped`.
- **G**: click "Regenerate" on a node → `next_action` field populates within ~30 s.

End-to-end smoke: launch 3-4 fresh conversations on different topics, click "Rebuild", visually verify the tree groups them correctly, click each node, confirm the conversation opens in the right pane.
