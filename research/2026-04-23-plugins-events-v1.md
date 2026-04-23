---
name: Events plugin — v1 implementation spec
status: ready-to-implement
scope: Events, Actions, Triggers (single-event only). No cron, no compound.
---

# Events plugin — v1 implementation spec

This doc is self-contained: reading it is enough to implement the first version of the `events` plugin without further context.

## Scope

**In scope for v1:**

- A new `events` plugin owning the infrastructure (registry, dispatcher, cleanup helpers).
- The `defineTriggerEvent` factory, used by *other plugins* to declare typed events.
- The `registerAction` registry for named action handlers.
- Single-event triggers: "when event E happens matching filter F, run action A with config C".
- FK-cascade cleanup when the match target is deleted.
- `deleteActionsTargeting` / `deleteTriggerRow` helpers for the two other cleanup paths.

**Out of scope (do not implement, do not design around):**

- Cron triggers (wall-clock scheduled actions).
- Compound triggers (AND / OR / N-of-M across events).
- Retries on action failure (log and continue).
- Frontend-side events (resources already cover UI reactivity).

These features were designed alongside v1 but are intentionally deferred. The v1 API shape has been validated against them; adding them later is additive.

## The three concepts

**Event.** A named fact that a plugin emits when its state changes. Defined once per event type (e.g. `taskCompleted`), emitted many times from the mutation sites that cause the transition. Each event carries a typed payload.

**Action.** A named handler registered once at plugin load. Referenced by string name in stored trigger rows so actions can be added/removed across deploys without invalidating stored triggers. Example: `"agents.launch"` wraps the existing `handleLaunch(...)` in the agents plugin.

**Trigger.** A persisted row linking "I care about event E matching filter F" to "run action A with config C". Created via `event.subscribe(...)`. One row per subscription. Stored in the event's own per-type table.

The framework's only job: when an event is emitted, find rows whose filter matches the payload, invoke each row's action.

## Grounding example

**User story.** Etienne wants: *when task X completes, auto-launch agent A to review the result.*

- **Event** — `taskCompleted`, defined by the `tasks-core` plugin. Payload: `{ taskId, parentId, status }`.
- **Action** — `"agents.launch"`, registered by the `agents` plugin. Config: `{ agentId, prompt? }`.
- **Trigger** — a row inserted into `_task_completed_triggers` with `task_id=X.id`, `action_name="agents.launch"`, `action_config={agentId:A.id}`, `one_shot=true`.

**Flow at wire level:**

1. Some code (e.g. the agents plugin's HTTP handler) creates the trigger:
   ```ts
   await taskCompleted.subscribe({
     taskId: X.id,
     action: "agents.launch",
     config: { agentId: A.id },
     oneShot: true,
   });
   ```
2. Later, `insertPush(...)` in `tasks-core` marks X's attempt complete. The same function emits:
   ```ts
   await taskCompleted.emit({ taskId: X.id, parentId: X.parentId, status: "success" });
   ```
3. The dispatcher runs `SELECT * FROM _task_completed_triggers WHERE enabled AND (task_id IS NULL OR task_id = 'X.id')`, finds the row, looks up `"agents.launch"` in the action registry, calls it with `{agentId: A.id}`. Agent A launches.
4. `one_shot=true` → the dispatcher deletes the row.

**Cleanup cases (all free, or nearly so):**

- Task X is deleted before completing → FK `ON DELETE CASCADE` removes the trigger row automatically.
- Agent A is deleted → agents plugin's delete handler calls `deleteActionsTargeting("agents.launch", { agentId: A.id })` to sweep all trigger tables.
- User changes their mind and removes the trigger from the UI → `deleteTriggerRow(triggerId)`.

This single flow exercises every part of the v1 API.

## Public API

All exports live in `plugins/events/server/index.ts`.

```ts
// ─── Event definition ────────────────────────────────────────────────

export interface TriggerEvent<T, S> {
  name: string;
  emit(payload: T): Promise<void>;
  subscribe(spec: S & SubscribeBase): Promise<string>;    // returns row id
}

export interface SubscribeBase {
  action: string;                              // must match a registerAction() name
  config: Record<string, unknown>;             // passed to the action handler
  oneShot?: boolean;                           // default true — delete row after firing
}

// Each filter slot is either a plain column (default identity-or-null match
// on the same-named payload key) or an object with a custom match predicate.
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
  filters: F;                                  // filter columns, keyed by payload key
  matchFn?: (t: Table, payload: T) => SQL;     // escape hatch (overrides per-filter match)
}): {
  table: PgTable;                              // export this at top level for drizzle-kit
  event: TriggerEvent<T, InferSubscribeShape<F, T>>;
};

// ─── Action registry ─────────────────────────────────────────────────

export type ActionHandler<C = unknown> = (config: C, ctx: ActionContext) => Promise<void> | void;

export interface ActionContext {
  payload: unknown;
  triggerId: string;
  table: PgTable;
}

export function registerAction<C>(name: string, run: ActionHandler<C>): void;

// ─── Cleanup helpers ─────────────────────────────────────────────────

export function deleteTriggerRow(id: string): Promise<void>;

export function deleteActionsTargeting(
  actionName: string,
  configMatch: Record<string, unknown>,         // e.g. { agentId: A.id }
): Promise<void>;
```

### Filter semantics

**Plain column (the 95% case).** Default match is `col IS NULL OR col = payload[key]`. Subscribing with a value filters; subscribing without one (NULL) matches every emit.

```ts
filters: {
  taskId: text("task_id").references(() => _tasks.id, { onDelete: "cascade" }),
}
// emit({ taskId: "X" }) matches rows where task_id IS NULL OR task_id = 'X'.
```

**Object form (when you need a non-identity predicate).** Each filter contributes one AND-ed predicate. Make each predicate null-tolerant on the column so NULL means "don't filter on this dimension":

```ts
filters: {
  minFilesChanged: {
    column: integer("min_files_changed"),
    match: (col, p) => or(isNull(col), gte(p.filesChanged, col)),
  },
}
```

**Cross-column (rare).** Override with top-level `matchFn`. When `matchFn` is set, per-filter `match` functions are ignored — it fully owns the WHERE clause.

### Subscribe filter shape

`event.subscribe(...)` takes one filter value per declared filter column (all optional — omit a key to match-any on that dimension), plus the base `{ action, config, oneShot? }`. Type-inferred from `F`:

```ts
// Given filters: { taskId: text(...) } with payload { taskId: string, parentId: string | null, ... }
await taskCompleted.subscribe({
  taskId: "X.id",                   // optional; omit to match any task
  action: "agents.launch",
  config: { agentId: "A.id" },
  oneShot: true,                    // default
});
```

### `deleteActionsTargeting` semantics

Iterates the trigger-table registry (populated at module load by each `defineTriggerEvent` call). For each table, runs:

```sql
DELETE FROM <table>
 WHERE action_name = $1
   AND action_config @> $2::jsonb     -- JSONB containment
```

`@>` ensures `deleteActionsTargeting("agents.launch", { agentId: A })` matches rows whose `action_config` contains `agentId: A`, regardless of other keys in the config. Use from a plugin's delete handler whenever the target of any action is removed.

### `deleteTriggerRow` semantics

UUIDs are unique across tables, so iterate the registry and `DELETE FROM <table> WHERE id = $1` on each. The first match deletes; the rest are no-ops. No reverse lookup needed.

## Storage model

### Base columns (shared by every trigger table)

Applied automatically inside `defineTriggerEvent`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK, default random | Row identifier |
| `action_name` | text, not null | Looked up in action registry |
| `action_config` | jsonb, not null | Passed to handler |
| `enabled` | boolean, not null, default true | Soft-disable without delete |
| `one_shot` | boolean, not null, default true | Delete after fire |
| `created_at` | timestamptz, not null, default now() | For debugging / ordering |

### Per-event filter columns

Declared by the plugin owning the event. Filter columns should be **nullable** so NULL means "match any on this dimension". If the column references a domain table, add `onDelete: "cascade"`.

### Indexes

For each declared filter column, `defineTriggerEvent` auto-creates a partial index:

```sql
CREATE INDEX <table>_<col>_idx ON <table>(<col>) WHERE enabled;
```

Keeps the dispatch query O(matches) even with thousands of disabled rows.

### Generated table example

```ts
// In plugins/tasks-core/server/internal/tables.ts
export const { event: taskCompleted, table: _taskCompletedTriggers } =
  defineTriggerEvent<{ taskId: string; parentId: string | null; status: "success" | "failure" }>({
    name: "tasks.completed",
    filters: {
      taskId: text("task_id").references(() => _tasks.id, { onDelete: "cascade" }),
    },
  });
```

Produces this table (roughly):

```sql
CREATE TABLE task_completed_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_name text NOT NULL,
  action_config jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  one_shot boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  task_id text REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX task_completed_triggers_task_id_idx
  ON task_completed_triggers(task_id) WHERE enabled;
```

## Dispatch

### `event.emit(payload)` query path

```sql
SELECT * FROM <table>
 WHERE enabled AND <match-expression>;
```

Where `<match-expression>` is the AND of every filter's predicate (or the `matchFn` override). For each returned row:

1. Look up `row.action_name` in the in-memory action registry.
2. If found: call `handler(row.action_config, { payload, triggerId: row.id, table })`. Any thrown error → log and continue.
3. If not found: log a warning, do **not** delete the row. (A later `registerAction` can still service it.)
4. If `row.one_shot === true` and the action was found: delete the row by id.

Rows are processed in parallel (`Promise.all`). No ordering guarantee between subscribers.

### No cross-process coordination

A single Bun process per worktree runs everything. No locks, no leader election. `emit` is called in-process from the mutation site.

### Unknown-action handling

Registering an action is idempotent at module load. If a trigger row references an action whose plugin was removed, dispatch logs and skips without deleting — the row is preserved so re-adding the plugin later picks up existing triggers.

## Emit-site discipline

**The one load-bearing contract.** The plugin that owns the state emits from the same function that mutates it. Same pattern as `resource.notify()`.

Concrete sites for v1:

- **`taskCompleted`** — task completion is derived in the `tasks_v` view from completed attempts, not a single column flip. Emit from each write that *causes* the not-done→done transition: `insertPush(...)` in [`plugins/tasks-core/server/internal/mutations/pushes.ts`](../plugins/tasks-core/server/internal/mutations/pushes.ts), and `updateTask({ drop: true })` in [`plugins/tasks-core/server/internal/mutations/tasks.ts`](../plugins/tasks-core/server/internal/mutations/tasks.ts). Each emitter must re-derive the task's status post-write and only emit on the transition (not on already-done writes).

- **`conversationCompleted`** — conversation `status` is a real column. Emit from the poller at [`plugins/conversations/server/internal/poller.ts:92`](../plugins/conversations/server/internal/poller.ts) right after `await updateConversation(id, { status: "gone", endedAt: new Date() })`.

If a future code path mutates state outside the plugin's API and skips the emit, no event fires. That is a caller bug, not a framework gap — the same contract every resource in the codebase already has.

## File layout

```
plugins/events/
└── server/
    ├── index.ts                    # Public API: defineTriggerEvent, registerAction,
    │                               # deleteTriggerRow, deleteActionsTargeting,
    │                               # default export = ServerPluginDefinition
    └── internal/
        ├── base-columns.ts         # eventTriggerColumns() — shared column set
        ├── registry.ts             # action map + trigger-table registry (Map<name, PgTable>)
        └── dispatch.ts             # runAction(row, payload, table): lookup, call, oneShot-delete

plugins/tasks-core/
└── server/
    ├── index.ts                    # re-export: export { taskCompleted } from "./internal/tables"
    └── internal/
        ├── tables.ts               # existing tables + defineTriggerEvent calls for
        │                           # taskCompleted + conversationCompleted (destructured exports)
        └── mutations/
            ├── tasks.ts            # emit taskCompleted on derived transition
            └── pushes.ts           # emit taskCompleted after attempt completion

plugins/agents/
└── server/
    ├── index.ts                    # registerAction("agents.launch", ...) at module load
    └── internal/
        └── handle-launch.ts        # existing launch code wrapped by the action

plugins/conversations/
└── server/
    └── internal/
        └── poller.ts               # emit conversationCompleted after gone-transition

server/src/
├── db/schema.ts                    # add: export * from "@plugins/tasks-core/server/internal/tables"
│                                   # (already there; confirm new tables are re-exported)
└── plugins.ts                      # add: eventsPlugin to the plugins list
```

## Why `defineTriggerEvent` returns `{ table, event }`

drizzle-kit walks `server/src/db/schema.ts` and checks each **named export** for the drizzle PgTable brand. It does not recurse into nested properties. So if you export only the event object and the table is hidden at `event.table`, drizzle-kit never sees it and no migration is generated.

Destructure at the call site:

```ts
export const { event: taskCompleted, table: _taskCompletedTriggers } =
  defineTriggerEvent<TaskCompletedPayload>({ ... });
```

`_taskCompletedTriggers` is now a top-level `PgTable` export → auto-registered via the existing `export * from "@plugins/tasks-core/server/internal/tables"` barrel line. `taskCompleted` is the event with `.emit` / `.subscribe`, re-exported from `index.ts` for other plugins.

## Implementation steps

Ordered to keep each step independently buildable / testable.

1. **Scaffold the events plugin.** Create `plugins/events/` with `package.json`, `server/index.ts` (empty `ServerPluginDefinition`), and `server/internal/` folder. Register in `server/src/plugins.ts`.
2. **Base columns + registry.** Implement `internal/base-columns.ts` and `internal/registry.ts`. Registry has two maps: actions (`name → handler`) and trigger tables (`name → PgTable`).
3. **`registerAction` + `defineTriggerEvent`.** Export from `index.ts`. `defineTriggerEvent` builds the table via `pgTable()` with base columns spread + declared filters, auto-generates partial indexes, registers the table in the registry, and returns `{ table, event }`. The `event` object's `emit` and `subscribe` close over the table and match logic.
4. **Dispatcher.** Implement `internal/dispatch.ts` with `runAction(row, payload, table)` — registry lookup, handler call (try/catch, log on error), oneShot delete.
5. **Cleanup helpers.** `deleteTriggerRow(id)` and `deleteActionsTargeting(name, match)` iterate the trigger-table registry.
6. **Wire up `taskCompleted`.** In `plugins/tasks-core/server/internal/tables.ts`, call `defineTriggerEvent` for `taskCompleted`. Destructure to top-level `event` + `table` exports. Re-export `taskCompleted` from `plugins/tasks-core/server/index.ts`.
7. **Wire up `conversationCompleted`.** Same pattern, in the same file.
8. **Emit sites.** Add emits in `mutations/pushes.ts`, `mutations/tasks.ts`, and `poller.ts` per the emit-site-discipline section. Each emitter re-derives state post-write and only emits on the relevant transition.
9. **Register `agents.launch`.** In `plugins/agents/server/index.ts`, call `registerAction("agents.launch", ({ agentId, prompt }) => handleLaunch(agentId, { prompt }))` at module load.
10. **Delete-target cleanup.** In the agents plugin's agent-delete handler, call `deleteActionsTargeting("agents.launch", { agentId })` before deleting the agent row.
11. **Build & migrate.** Run `./singularity build` — drizzle-kit picks up the two new tables and generates a migration. Server restart applies it.

## Acceptance tests

Manual (exercise from a conversation):

1. **Single-event, one-shot.** Create task X. Subscribe `taskCompleted` with `taskId: X.id, action: "agents.launch", config: { agentId: A.id }, oneShot: true`. Complete X. Verify: agent A launches; the trigger row is deleted.
2. **Single-event, recurring.** Same subscription with `oneShot: false`. Complete + re-open + re-complete X. Verify: action fires twice; row persists.
3. **Match-any.** Subscribe with `taskId` omitted. Complete any task. Verify action fires.
4. **FK cascade cleanup.** Subscribe with `taskId: X.id`. Delete X. Verify the trigger row is gone (SQL: `SELECT * FROM task_completed_triggers WHERE task_id = 'X.id'` returns empty).
5. **Action-target cleanup.** Subscribe with `config: { agentId: A.id }`. Delete agent A via the agents plugin (which must call `deleteActionsTargeting`). Verify the trigger row is gone.
6. **Unknown action.** Subscribe with `action: "nonexistent"`. Emit the matching event. Verify: log warning, no crash, row NOT deleted. Register the action, emit again — now it fires.
7. **Index usage.** With 5k rows in `task_completed_triggers` across 100 distinct `task_id` values, `EXPLAIN` the dispatch query — must be `Index Scan` on the partial index, not `Seq Scan`.

Unit-level:

- `defineTriggerEvent` type inference: `match` callback's payload typed as `T`; `subscribe({...})` filter keys typed against `F`; column arguments typed against the bound table.
- `event.emit(payload)` against an empty table: no-op, no errors.
- `runAction` with unknown `action_name`: log-only; row preserved.
- `deleteActionsTargeting` only deletes rows whose `action_config` contains every key in the match object (JSONB `@>` semantics), not a superset.
