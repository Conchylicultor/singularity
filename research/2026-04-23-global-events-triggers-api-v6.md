---
name: Events & Triggers API — v6 (working draft)
status: working-draft
supersedes: 2026-04-22-global-events-triggers-api-v5.md
---

# Events & Triggers API — v6 (working draft)

> **⚠ Working draft.** Continues [v5](./2026-04-22-global-events-triggers-api-v5.md). v6 answers two open design questions that v5 flagged but didn't settle:
>
> 1. **Can we abstract the table+event boilerplate?** — yes, via `defineTriggerEvent`. See §1.
> 2. **Does the framework need any built-in knowledge of compound / AND / OR?** — no, confirmed by walking a real UI-driven workflow end-to-end. See §2.
>
> Everything else (storage model, dispatch, emit-site discipline, cron separateness, FK-cascade cleanup) carries forward from v5 unchanged.

## What's new in v6

| v5 | v6 | Why |
|---|---|---|
| Separate `eventTriggerColumns()` helper + raw `pgTable(...)` + separate `defineEventType({ name, table, match })` | Single `defineTriggerEvent({ name, filters })` that creates the table, indexes, and EventType together | Cuts boilerplate to one declaration per event; consistent table naming, index naming, and match query |
| `match: (p) => or(isNull(col), eq(col, p.col))` hand-written every time | Auto-generated from filter column names (payload key = column name) | The hand-written version was identical every time — an abstraction waiting to happen |
| Identity-only filters; anything richer (`gte`, `LIKE`, `ANY`) needed a full `matchFn` override | Per-filter match predicate (object form); defaults to identity-or-null | Avoids an operator-enum DSL; gets SQL-full expressiveness without losing the 1-line shorthand |
| Trigger tables living in a not-yet-existent `server/api.ts` | Tables live in `internal/tables.ts`, event re-exported from `index.ts` | Matches the codebase's actual layout; drizzle-kit auto-registers via the existing barrel |
| `defineTriggerEvent` returning a single event object with `.table` nested inside | Returns `{ table, event }` so `table` is a top-level PgTable export | drizzle-kit's schema walker doesn't recurse into nested properties |
| Workflow only sketched at the individual-trigger level | End-to-end UI-driven workflow through compound, cleanup, and listing | Proves the API surface is sufficient for the real use case |
| Implicit assumption that compound needs no framework support | Confirmed by walking the workflow: compound is strictly a plugin concern | Any AND/OR/N-of-M variant is a different orchestrator on the same primitives |

## 1. `defineTriggerEvent` — unified table + event

The 95% case: each trigger table has N filter columns (usually 1, namely the FK target), and the match query is always `(col IS NULL OR col = payload[key])` AND-ed across filters.

### API

```ts
// plugins/events/server/index.ts

export interface TriggerEvent<T, S> {
  name: string;
  emit(payload: T): Promise<void>;
  subscribe(spec: S & SubscribeBase): Promise<string>;    // returns row id
}

interface SubscribeBase {
  action: string;
  config: Record<string, unknown>;
  oneShot?: boolean;                           // default true
}

// A filter slot is either a plain column (identity-or-null match on the
// same-named payload key) or an object with a custom match predicate.
type FilterSlot<T, K extends keyof T> =
  | PgColumnBuilder
  | {
      column: PgColumnBuilder;
      match: (col: AnyPgColumn, payload: T) => SQL;
    };

export function defineTriggerEvent<
  T extends Record<string, unknown>,
  F extends { [K in keyof F]: FilterSlot<T, K & keyof T> },
>(def: {
  name: string;                                // e.g. "tasks.completed"
  filters: F;                                  // per-filter column + optional match
  matchFn?: (t: Table, payload: T) => SQL;     // cross-column escape hatch
}): {
  table: PgTable;                              // exported separately for drizzle-kit
  event: TriggerEvent<T, InferSubscribeShape<F, T>>;
};
```

Two things to notice:

1. **Return shape is `{ table, event }`.** The table is a first-class top-level value so `server/src/db/schema.ts`'s existing `export * from ".../internal/tables"` picks it up. See §2 for why nesting the table under `event.table` doesn't work with drizzle-kit.
2. **Filter slots are polymorphic.** Plain column = identity-or-null match (the 95% case). Object form with `{ column, match }` = arbitrary predicate. See "Filters beyond identity" below.

### Usage — the v5 examples, rewritten

**Before (v5):**

```ts
// plugins/tasks-core/server/internal/tables.ts
import { eventTriggerColumns } from "@plugins/events/server/api";

export const _taskCompletedTriggers = pgTable(
  "task_completed_triggers",
  {
    ...eventTriggerColumns(),
    taskId: text("task_id").references(() => _tasks.id, { onDelete: "cascade" }),
  },
  (t) => [index("task_completed_triggers_task_id_idx").on(t.taskId).where(sql`enabled`)],
);

// plugins/tasks-core/server/api.ts
export const taskCompleted = defineEventType<TaskCompletedPayload, { taskId?: string }>({
  name: "tasks.completed",
  table: _taskCompletedTriggers,
  match: (p) => or(
    isNull(_taskCompletedTriggers.taskId),
    eq(_taskCompletedTriggers.taskId, p.taskId),
  )!,
});
```

**After (v6):**

```ts
// plugins/tasks-core/server/internal/tables.ts
import { defineTriggerEvent } from "@plugins/events/server";

export interface TaskCompletedPayload {
  taskId: string;
  parentId: string | null;
  status: "success" | "failure";
}

// Destructure so `_taskCompletedTriggers` is a top-level PgTable export —
// drizzle-kit's schema walker picks it up via the existing `export * from
// "./internal/tables"` in server/src/db/schema.ts. See §5.
export const { event: taskCompleted, table: _taskCompletedTriggers } =
  defineTriggerEvent<TaskCompletedPayload>({
    name: "tasks.completed",
    filters: {
      taskId: text("task_id").references(() => _tasks.id, { onDelete: "cascade" }),
    },
  });

// plugins/tasks-core/server/index.ts — re-export the event for other plugins
export { taskCompleted } from "./internal/tables";
```

Two filters, still clean:

```ts
export const { event: conversationCompleted, table: _conversationCompletedTriggers } =
  defineTriggerEvent<ConversationCompletedPayload>({
    name: "conversations.completed",
    filters: {
      conversationId: text("conversation_id").references(() => _conversations.id, { onDelete: "cascade" }),
    },
  });
```

### Filters beyond identity

The identity-or-null default only covers "stored value equals payload value (or match-any)". Real triggers often want more:

- "Fire when the task's priority is at least N" — `col <= payload.priority`
- "Fire when the conversation ran for more than D seconds" — `col <= payload.durationSeconds`
- "Fire when the push touched a file under this path prefix" — `payload.filePath LIKE col || '%'`
- "Fire when the agent id is in this set" — `payload.agentId = ANY(col)` where `col` is a text array

For these, each filter slot can be an object with an explicit `match` function. The framework ANDs every filter's predicate together automatically.

```ts
export const { event: pushLanded, table: _pushLandedTriggers } =
  defineTriggerEvent<PushLandedPayload>({
    name: "pushes.landed",
    filters: {
      // Plain column → identity-or-null on payload.repoId
      repoId: text("repo_id").references(() => _repos.id, { onDelete: "cascade" }),

      // Object form → custom match
      minFilesChanged: {
        column: integer("min_files_changed"),
        match: (col, p) => or(isNull(col), gte(p.filesChanged, col)),
      },
      pathPrefix: {
        column: text("path_prefix"),
        match: (col, p) => or(isNull(col), sql`${p.filePath} LIKE ${col} || '%'`),
      },
    },
  });
```

All three predicates are AND-ed. Each is independently null-tolerant (a NULL value in the column means "don't filter on this dimension"), which keeps the match-any semantics consistent across columns.

**Why per-filter `match` functions, not a shared operator-enum like `op: "gte"`?** An enum caps out fast (substring, array-contains, JSONB path, range overlap, …). A predicate is exactly as expressive as SQL, types against the declared `T`, and is what every escape-hatch case would have written anyway. The plain-column shorthand still gets the 95% case down to one line, so the cost of the object form is paid only when you opt into complexity.

**Cross-column conditions.** For rare cases where the predicate spans multiple filter columns (e.g. `col_a + col_b <= payload.total`), the top-level `matchFn` escape hatch remains:

```ts
defineTriggerEvent<P>({
  name: "...",
  filters: { a: integer("a"), b: integer("b") },
  matchFn: (t, p) => gte(p.total, sql`${t.a} + ${t.b}`),
});
```

When `matchFn` is supplied, per-filter `match` functions are ignored (matchFn fully owns the WHERE clause). A `matchFn` is probably a smell worth refactoring into separate events, but the hatch exists.

## 2. Placement & drizzle-kit registration

The codebase doesn't use `server/api.ts` files. Each plugin's public surface is `server/index.ts` (ServerPluginDefinition default-export plus named re-exports of what other plugins can import). Physical tables live in `internal/tables.ts` and get registered with drizzle-kit through:

```ts
// server/src/db/schema.ts
export * from "@plugins/tasks-core/server/internal/tables";
```

`drizzle.config.ts` points its `schema:` at that barrel and walks named exports looking for `PgTable`-branded values.

This constrains where `defineTriggerEvent` can be called and how its result is exposed:

**Placement.** Call it in `internal/tables.ts`. That keeps the physical-tables-live-in-tables.ts invariant, and `tables.ts` is allowed to import `@plugins/events/server` because the events plugin has no domain FK targets for `tables.ts` to cycle through — it's a pure helper module from this file's perspective. The leaf rule stays intact.

**Registration.** drizzle-kit inspects each named export of `tables.ts` and checks whether it's a drizzle-branded table. It does **not** recurse into nested properties. So `export const taskCompleted = defineTriggerEvent(...)` alone would leave `taskCompleted.table` invisible to drizzle-kit — no migration would be generated. The fix is to make the PgTable a top-level named export:

```ts
// internal/tables.ts
export const { event: taskCompleted, table: _taskCompletedTriggers } =
  defineTriggerEvent<TaskCompletedPayload>({ ... });
```

`_taskCompletedTriggers` is a top-level named export of type PgTable → drizzle-kit registers it. `taskCompleted` is the event with `.emit` / `.subscribe` — re-exported from `index.ts` for other plugins to use.

**No double wire-up in schema.ts.** `server/src/db/schema.ts` already has `export * from "@plugins/tasks-core/server/internal/tables"`. That line catches the new table automatically. No new lines needed per event. A new plugin that defines trigger events only needs one barrel line in schema.ts (the same one it would need for any hand-written table).

Placement table:

| Table | File |
|---|---|
| `_task_completed_triggers` | `plugins/tasks-core/server/internal/tables.ts` (via `defineTriggerEvent`) |
| `_conversation_completed_triggers` | `plugins/tasks-core/server/internal/tables.ts` (via `defineTriggerEvent`) |
| `_compound_states` (state table, no trigger semantics) | `plugins/events/plugins/compound/server/internal/tables.ts` (raw `pgTable`) |
| `_compound_completed_triggers` | `plugins/events/plugins/compound/server/internal/tables.ts` (via `defineTriggerEvent`) |
| `_cron_triggers` (different shape from trigger events) | `plugins/events/server/internal/tables.ts` (raw `pgTable`) |

## 3. End-to-end workflow — auto-launch review agent

A concrete use case, walked from user click to final DB state, to confirm the primitives cover real flows without framework-level AND/OR machinery.

### The scenario

Etienne is working on a multi-part refactor. He creates parent task **X "Refactor auth"** and three children:

- **X.1** "Backend: update session store"
- **X.2** "Frontend: refresh auth hooks"
- **X.3** "Write migration tests"

He already has an agent **R "Review auth changes"** defined. He wants: *when all three subtasks finish, auto-launch R*.

### Step 1 — User configures the trigger

Etienne opens **R**'s detail pane → "Triggers" tab → clicks **+ Add trigger** → picks **"When ALL of these are done"** → ticks X.1, X.2, X.3 → clicks **Save**.

UI call:

```http
POST /api/agents/R.id/triggers
{
  "kind": "compound",
  "mode": "all",
  "sources": [
    { "event": "tasks.completed", "match": { "taskId": "X.1" } },
    { "event": "tasks.completed", "match": { "taskId": "X.2" } },
    { "event": "tasks.completed", "match": { "taskId": "X.3" } }
  ]
}
```

Agents plugin handler (pseudocode):

```ts
async function addTrigger(agentId: string, spec: TriggerSpec) {
  if (spec.kind === "compound" && spec.mode === "all") {
    const groupId = await compound({
      all: spec.sources.map((s) => ({
        event: eventByName(s.event),           // resolves "tasks.completed" → taskCompleted
        match: s.match,
      })),
      action: "agents.launch",
      config: { agentId },
    });
    // Save UI-facing trigger metadata so we can list + describe it later.
    await db.insert(_agentTriggers).values({ id: ulid(), agentId, groupId, spec });
  } else if (spec.kind === "single") {
    const triggerId = await spec.event.subscribe({
      ...spec.match,
      action: "agents.launch",
      config: { agentId },
      oneShot: true,
    });
    await db.insert(_agentTriggers).values({ id: ulid(), agentId, triggerId, spec });
  }
}
```

DB state after save (4 new rows in trigger tables, 1 state row, 1 UI-metadata row):

```
_compound_states:
  id=G, required=3, fired_ids={}

_task_completed_triggers:
  (task_id=X.1, action=compound.step, config={groupId:G, childId:'0'}, oneShot=true)
  (task_id=X.2, action=compound.step, config={groupId:G, childId:'1'}, oneShot=true)
  (task_id=X.3, action=compound.step, config={groupId:G, childId:'2'}, oneShot=true)

_compound_completed_triggers:
  (group_id=G, action=agents.launch, config={agentId:R.id}, oneShot=true)

_agent_triggers (agents plugin, UI metadata):
  (agent_id=R.id, group_id=G, spec=<JSON of the UI form>)
```

Every row except `_agent_triggers` was created by three primitive calls total: one `compound()` that itself made three `taskCompleted.subscribe` calls and one `compoundCompleted.subscribe`. **No framework code knows what "all" means** — `compound()` is a plain function in the compound plugin.

### Step 2 — Subtasks complete

X.1 completes. `insertPush` in `plugins/tasks-core/server/internal/mutations/pushes.ts` transitions X.1 to done, then emits:

```ts
await taskCompleted.emit({ taskId: "X.1", parentId: "X", status: "success" });
```

Dispatcher query:

```sql
SELECT * FROM task_completed_triggers
 WHERE enabled AND (task_id IS NULL OR task_id = 'X.1');
```

Returns the row for X.1. Action `compound.step` fires with `{ groupId: G, childId: '0' }`:

```sql
UPDATE _compound_states
   SET fired_ids = array_append(fired_ids, '0')
 WHERE id = G AND NOT ('0' = ANY(fired_ids))
 RETURNING fired_ids, required;
-- → fired_ids={'0'}, required=3 → length 1 < 3, no-op
```

Then `oneShot=true` deletes the X.1 row.

X.2 completes. Same path. `fired_ids={'0','1'}`. No-op.

X.3 completes. `fired_ids={'0','1','2'}`. `length 3 >= required 3`:

```ts
await compoundCompleted.emit({ groupId: G });
await db.delete(_compoundStates).where(eq(_compoundStates.id, G));
// FK cascade removes _compound_completed_triggers rows for G.
await deleteActionsTargeting("compound.step", { groupId: G });
// (both siblings already self-deleted by oneShot; this is the safety net)
```

`compoundCompleted.emit` runs:

```sql
SELECT * FROM compound_completed_triggers
 WHERE enabled AND (group_id IS NULL OR group_id = 'G');
```

Returns R's row. Action `agents.launch({ agentId: R.id })` fires → creates conversation for R in a new worktree. Then `oneShot=true` — but the row was just cascade-deleted. Harmless (delete-by-id on a missing row is a no-op).

Final state:

```
_compound_states:  (empty — G deleted)
_task_completed_triggers:  (empty — all 3 children deleted by oneShot)
_compound_completed_triggers:  (empty — cascade-deleted)
_agent_triggers:  row for R still exists with group_id=G  ← stale reference!
```

### Step 3 — Cleanup of the UI metadata

The `_agent_triggers` row in step 2 is now stale: its `group_id=G` points at a `_compound_states` row that no longer exists. Two options:

- **Agents plugin deletes `_agent_triggers` after the compound fires.** Requires a post-action hook, which the framework doesn't currently expose. No.
- **Agents plugin treats `_agent_triggers` as soft history and filters by "is the compound still active?" on read.** A join against `_compound_states`; cheap since the list is small. Works with no framework change.

Lean: option 2 for v1. Not a framework concern.

### Step 4 — User deletes the configured trigger (before it fires)

Etienne realizes he set it up against the wrong agent. He clicks **Remove** on the trigger in R's UI.

```http
DELETE /api/agents/R.id/triggers/<trigger_id>
```

Agents plugin handler:

```ts
async function removeTrigger(agentTriggerId: string) {
  const row = await db.select().from(_agentTriggers).where(eq(_agentTriggers.id, agentTriggerId));
  if (row.groupId) {
    await deleteCompound(row.groupId);      // compound plugin's helper
  } else if (row.triggerId) {
    await deleteTriggerRow(row.triggerId);  // events plugin helper (hand-delete by id)
  }
  await db.delete(_agentTriggers).where(eq(_agentTriggers.id, agentTriggerId));
}
```

Where `deleteCompound(G)`:

```ts
// plugins/events/plugins/compound/server/index.ts
export async function deleteCompound(groupId: string): Promise<void> {
  await db.delete(_compoundStates).where(eq(_compoundStates.id, groupId));
  // FK cascade removes _compound_completed_triggers rows.
  await deleteActionsTargeting("compound.step", { groupId });
  // Removes child rows across all trigger tables.
}
```

Three lines of compound plugin code, using only public primitives.

### Step 5 — User deletes one subtask (partial cleanup)

Etienne deletes X.2 entirely. FK cascade on `_task_completed_triggers.task_id → _tasks.id` removes the X.2 trigger row. `_compound_states` row for G now has `required=3` but only two surviving children — it will never complete.

This is v5's **open question #1** (orphan compound states). v6 keeps the same lean: accept orphan for v1; optionally add a GC pass to the cron scheduler later.

### Step 6 — User deletes agent R (target-side cleanup)

Etienne deletes R before the subtasks complete. The agents plugin's delete handler:

```ts
async function deleteAgent(agentId: string) {
  await deleteActionsTargeting("agents.launch", { agentId });
  // → removes the _compound_completed_triggers row for G (and any direct
  //   agents.launch rows across other trigger tables and _cron_triggers).
  // → does NOT remove child compound.step rows. Those fire harmlessly when
  //   their tasks complete — compound.step reaches threshold, emits
  //   compoundCompleted, matches no row (destination gone), then does its own
  //   cleanup of _compound_states + siblings. Self-healing.
  await db.delete(_agents).where(eq(_agents.id, agentId));
  // FK cascades remove _agent_triggers rows for R.
}
```

The chain is self-healing: the compound's completion step runs its cleanup regardless of whether the downstream action matched anything. The worst case is that the `_compound_states` row lingers a little longer (until the last child fires, or forever if a child's target is also deleted — see step 5).

### What the workflow confirms

1. **Framework needs zero AND/OR knowledge.** The only primitives used are `defineTriggerEvent` (which gives you `.emit` + `.subscribe`), `registerAction`, `deleteActionsTargeting`, and plain Drizzle inserts/deletes. `compound()` is ~40 lines of plugin code.
2. **"OR" (any-of) would be the same pattern with different cleanup.** One compound.step fires → instead of incrementing, immediately emit + cleanup. Not written out here, but exercise for the reader — no framework change required.
3. **"N-of-M" is `compound()` with `required: N`.** Already works.
4. **Mixed event+cron compounds are a pure extension**: `compound()` could accept `{ cron: "0 9 * * *" }` entries by inserting into `_cron_triggers` with `compound.step` as the action. Cron firing is just another source of `compound.step`. No framework change. (v5 open question #5; v6 confirms the path but still defers shipping it.)
5. **Per-plugin UI metadata is a per-plugin concern.** `_agent_triggers` isn't a framework table — it's the agents plugin's own record of what the user configured, so it can render a list with human-readable labels. The framework doesn't need a "triggers-owned-by" index.

## 4. Primitives the workflow reveals we still need

Two primitives are used by the workflow but not yet in the v5 API:

### `deleteTriggerRow(id: string)`

For the "user deletes a non-compound trigger by id" case. Trivial:

```ts
export async function deleteTriggerRow(id: string): Promise<void> {
  for (const table of triggerTableRegistry.values()) {
    await db.delete(table).where(eq((table as any).id, id));
  }
}
```

Uses the same table registry (v5 open question #3) that `deleteActionsTargeting` already needs. No new infrastructure.

### `deleteCompound(groupId: string)`

Lives in the compound plugin, not the framework. Already shown in step 4. Three lines.

Nothing else is missing. The v5 surface + these two additions covers the workflow.

## 5. API surface — consolidated

```ts
// plugins/events/server/index.ts

// Unified table + event. Destructure at the call site so `table` ends up as
// a top-level PgTable export for drizzle-kit (§2).
export function defineTriggerEvent<
  T extends Record<string, unknown>,
  F extends { [K in keyof F]: FilterSlot<T, K & keyof T> },
>(def: {
  name: string;
  filters: F;
  matchFn?: (t: Table, payload: T) => SQL;
}): {
  table: PgTable;
  event: TriggerEvent<T, InferSubscribeShape<F, T>>;
};

// Action registry
export function registerAction<C>(name: string, run: ActionHandler<C>): void;

// Cron (separate table, separate dispatcher)
export function createCronTrigger(spec: {
  cronExpr: string;
  action: string;
  config: object;
}): Promise<string>;

// Cleanup by id, by action target
export function deleteTriggerRow(id: string): Promise<void>;
export function deleteActionsTargeting(
  actionName: string,
  configMatch: Record<string, unknown>,
): Promise<void>;

// plugins/events/plugins/compound/server/index.ts

export function compound<Events extends Array<{ event: TriggerEvent<any, any>; match: any }>>(spec: {
  all: Events;
  action: string;
  config: Record<string, unknown>;
}): Promise<string>;                             // returns groupId

export function deleteCompound(groupId: string): Promise<void>;
```

Five event-plugin exports + two compound-plugin exports. That's the whole public API.

## Carried forward from v5 (unchanged)

- Per-event-type tables with `ON DELETE CASCADE` FK to the domain table.
- Cron has its own primitive and its own dispatcher loop.
- Emit-site discipline lives at the state-mutation site (same contract as `resource.notify()`).
- Dispatch uses partial indexes on filter columns WHERE enabled.
- Cron scheduler uses `setInterval` + `SELECT FOR UPDATE SKIP LOCKED`, modeled on `push-watcher.ts`.
- Asymmetry: `emit` and `subscribe` are methods on the event def; `registerAction` / `createCronTrigger` / `deleteActionsTargeting` / `deleteTriggerRow` are free functions.

## Open questions (carried from v5, pared down)

1. **Compound orphan cleanup** — still open. Lean: accept orphans for v1; add a GC pass later. (Unchanged.)
2. **Compound plugin location** — nested under events, most likely. (Unchanged.)
3. **Trigger table registry discovery** — self-register via `defineTriggerEvent`. v6 uses this for both `deleteActionsTargeting` and the new `deleteTriggerRow`. Settled.
4. **Type-safety of `compound()`'s per-child match** — tighten with variadic generics if feasible; otherwise `match: any` and document. Unchanged.
5. **Cron + event composition in `compound()`** — defer, path is clear (§2 step 6 analysis).
6. **What does `taskCompleted` fire on?** — drop, hold, push-completed-attempt. Still blocks flow 3. Suggests an explicit `_tasks.completedAt` column; out of scope here but tracked.
7. **Subscribe-filter typing** — resolved by v6's `defineTriggerEvent` type contract: the subscribe filter shape is derived automatically from `F` (the filter column map).

## Verification (deltas from v5)

Add two checks:

10. **`defineTriggerEvent` migration invariant.** Build a trigger event, inspect generated migration: table name is `{event_name_with_dots_to_underscores}_triggers`, has `eventTriggerColumns` + declared filter columns, index is named `{table}_{filter}_idx` and is partial WHERE enabled.
11. **End-to-end workflow** (this doc's §2). Create 3 subtasks + compound + review agent. Complete all subtasks. Verify review agent launched, all trigger-side rows cleaned up. Then run variants: delete trigger before firing; delete one subtask before firing; delete the agent before firing. Each variant matches the expected final state in steps 4–6.

## Why this is still a working draft

Shape feels tight: `defineTriggerEvent` collapses the per-event boilerplate, and the workflow walks cleanly through compound + cleanup + listing without the framework knowing anything about compound. The remaining opens (orphan GC, cron-compound composition, taskCompleted emit sites) are either acceptable-for-v1 or blocked on tasks-core decisions, not on the events API shape.

Blockers before implementation:

- Decide whether the `_agent_triggers` pattern (per-plugin UI-metadata table) stays in the agents plugin or graduates to a reusable `@events/ui-metadata` helper. Lean: per-plugin for now, revisit after the second plugin needs it.
- Confirm the variadic-generics typing for `compound()`'s per-child match is acceptable (open #4).
- Settle what counts as "task completed" (open #6) — blocks the third end-to-end flow but not the v6 API shape.
