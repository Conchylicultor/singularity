# Events & Triggers API — v5 (working draft)

> **⚠ This is a working draft, not a final design.** It captures the state of the design after a round of API critique that pushed back on v4's hidden complexity (raw inserts at every subscribe site, special-cased compound logic inside the framework). v5 lands on a small, layered surface where compound is provably implementable as just another plugin, but several open questions remain — see the section at the end.
>
> Supersedes [v4](./2026-04-22-global-events-triggers-api-v4.md) for the API shape. The storage decision (per-event-type tables with FK cascade) carries forward unchanged.

## What's settled

- **Per-event-type tables** (from v4). Each event type has its own table with typed columns and an `ON DELETE CASCADE` FK to its domain (e.g. `_task_completed_triggers.task_id REFERENCES tasks(id) ON DELETE CASCADE`). Tables live in the plugin that owns the FK target. The events plugin owns infrastructure + cron, not per-event tables.
- **The framework primitive is "subscribe to an event with a filter, run an action when it fires."** That is the only thing the dispatcher knows how to do.
- **Compound triggers (X and Y → Z) are not a framework feature** — they're a plugin built on the primitive. Proof of API completeness, not extra machinery.
- **Cron stays separate.** Different wake-up mechanism (wall clock vs. emit), so it has its own primitive (`createCronTrigger`) and its own dispatcher loop. Trying to unify it under the event API was forcing symmetry that doesn't exist.
- **No `spawnedBy` filter** on conversation triggers. If a real use case needs "trigger only when agent A's children finish", the action handler can fetch the conversation row and filter. The trigger table stays minimal.

## What changes from v4

| v4 | v5 | Why |
|---|---|---|
| Raw `db.insert(_taskCompletedTriggers).values(...)` at every subscribe site | `taskCompleted.subscribe({ taskId: X.id, action, config })` | The "no helper" decision pushed storage internals onto consumers. Wrong direction. |
| Hand-written `db.delete(...).where(sql\`action_config->>'agentId'=...\`)` for action-target cleanup | `deleteActionsTargeting("agents.launch", { agentId: A.id })` | Same JSONB query at every action-target deletion site. Helper centralizes it. |
| `EventType<T, Row>` (with vestigial `Row`) | `EventType<T, S>` where `S` is the typed subscribe-filter shape | `Row` was unused. `S` is the missing piece for typed `.subscribe()`. |
| Compound deferred, sketched as framework-internal machinery | Compound is a self-contained plugin built on `event.subscribe` + `event.emit` | Provably generic — the framework needs zero compound-awareness. |
| `spawnedBy` column on `_conversation_completed_triggers` | Removed | Not load-bearing; filter inside the action if needed. |

## The three primitives

```ts
// 1. Event triggers (the load-bearing primitive)
await taskCompleted.subscribe({
  taskId: X.id,                    // typed filter — autocompletes per event
  action: "tasks.launch",
  config: { taskId: Y.id },
  oneShot: true,
});

// 2. Cron triggers (separate dispatcher, separate API)
await createCronTrigger({
  cronExpr: "0 9 * * *",
  action: "agents.launch",
  config: { agentId: A.id },
});

// 3. Compound triggers (a plugin built on #1)
await compound({
  all: [
    { event: taskCompleted,         match: { taskId: X.id } },
    { event: conversationCompleted, match: { conversationId: Y.id } },
  ],
  action: "agents.launch",
  config: { agentId: Z.id },
});
```

`compound` lives in its own plugin (or a sub-plugin of events). It uses no framework-internal API — only `event.subscribe(...)` and `event.emit(...)`, both of which are public.

## API surface — events plugin

```ts
// plugins/events/server/api.ts

export interface EventType<T, S> {
  name: string;
  table: PgTable;
  match: (payload: T) => SQL;
  emit(payload: T): Promise<void>;
  subscribe(spec: S & SubscribeBase): Promise<string>;     // returns trigger row id
}

interface SubscribeBase {
  action: string;
  config: Record<string, unknown>;
  oneShot?: boolean;                                        // default true
}

export function defineEventType<T, S>(def: {
  name: string;
  table: PgTable;
  match: (payload: T) => SQL;
}): EventType<T, S>;

export function registerAction<C>(name: string, run: ActionHandler<C>): void;

export function createCronTrigger(spec: {
  cronExpr: string;
  action: string;
  config: object;
}): Promise<string>;

export function deleteActionsTargeting(
  actionName: string,
  configMatch: Record<string, unknown>,           // e.g. { agentId: A.id }
): Promise<void>;

export interface ActionContext {
  payload: unknown;          // null for cron
  triggerId: string;         // the row that fired
  table: PgTable;            // for one-shot deletes
}
```

**Asymmetry note (still applies).** `emit` and `subscribe` are methods on the event def because each event is a typed, named, plugin-owned object — same shape as `recentConversationsResource.notify()`. `registerAction`, `createCronTrigger`, and `deleteActionsTargeting` are free functions because they aren't bound to a single event type.

## Storage model (unchanged from v4)

Per-event-type tables, located in the plugin that owns the FK target:

| Table | Lives in | FK |
|---|---|---|
| `_cron_triggers` | `plugins/events/server/internal/tables.ts` | (none) |
| `_task_completed_triggers` | `plugins/tasks-core/server/internal/tables.ts` | `task_id → _tasks(id) ON DELETE CASCADE` |
| `_conversation_completed_triggers` | `plugins/tasks-core/server/internal/tables.ts` | `conversation_id → _conversations(id) ON DELETE CASCADE` |
| `_compound_states` + `_compound_completed_triggers` | `plugins/events/plugins/compound/server/internal/tables.ts` (or its own plugin) | `groupId → _compound_states(id) ON DELETE CASCADE` |

Common columns shared across event-trigger tables come from `eventTriggerColumns()` (id, action_name, action_config, enabled, oneShot, createdAt). Plugin-specific filter columns are added on top.

Forced placement rule (from codebase pattern): tables.ts files cannot import from another plugin's tables.ts (load-order leaves), so the trigger table must live wherever its FK target lives. See [`plugins/tasks-core/server/internal/tables.ts:13`](../plugins/tasks-core/server/internal/tables.ts).

## Compound, worked out

This is the part that's new in v5 and worth seeing in detail because it's the proof that the framework is complete.

### Tables

```ts
// plugins/events/plugins/compound/server/internal/tables.ts

export const _compoundStates = pgTable("compound_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  required: integer("required").notNull(),
  firedIds: text("fired_ids").array().notNull().default([]),     // set semantics, not counter
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// The synthetic event the compound emits when threshold is met. It's a
// regular event-trigger table — the framework doesn't know it's special.
export const _compoundCompletedTriggers = pgTable("compound_completed_triggers", {
  ...eventTriggerColumns(),
  groupId: uuid("group_id").references(() => _compoundStates.id, { onDelete: "cascade" }),
});
```

### EventType + action

```ts
// plugins/events/plugins/compound/server/api.ts

export const compoundCompleted = defineEventType<{ groupId: string }, { groupId?: string }>({
  name: "compound.completed",
  table: _compoundCompletedTriggers,
  match: (p) => or(
    isNull(_compoundCompletedTriggers.groupId),
    eq(_compoundCompletedTriggers.groupId, p.groupId),
  )!,
});

registerAction<{ groupId: string; childId: string }>("compound.step", async (cfg) => {
  // Atomic: only count first fire of each child (idempotent under re-fires)
  const [state] = await db.execute<{ fired_ids: string[]; required: number }>(sql`
    UPDATE _compound_states
       SET fired_ids = array_append(fired_ids, ${cfg.childId})
     WHERE id = ${cfg.groupId} AND NOT (${cfg.childId} = ANY(fired_ids))
     RETURNING fired_ids, required
  `);
  if (!state || state.fired_ids.length < state.required) return;

  await compoundCompleted.emit({ groupId: cfg.groupId });   // ← back through the regular path
  await db.delete(_compoundStates).where(eq(_compoundStates.id, cfg.groupId));
  // FK cascade removes _compoundCompletedTriggers rows for this groupId.
  // Sibling rows in other event-trigger tables (the compound's children) clean up via:
  await deleteActionsTargeting("compound.step", { groupId: cfg.groupId });
});
```

### `compound()` orchestrator

```ts
export async function compound<Events extends Array<{ event: EventType<any, any>; match: any }>>(spec: {
  all: Events;
  action: string;
  config: Record<string, unknown>;
}): Promise<string> {
  const groupId = randomUUID();
  await db.insert(_compoundStates).values({ id: groupId, required: spec.all.length });

  await Promise.all(spec.all.map((w, i) =>
    w.event.subscribe({
      ...w.match,
      action: "compound.step",
      config: { groupId, childId: String(i) },
      oneShot: true,
    }),
  ));

  await compoundCompleted.subscribe({
    groupId,
    action: spec.action,
    config: spec.config,
    oneShot: true,
  });

  return groupId;
}
```

That's the whole compound plugin. Three things — a state table, an action, an event type — using only `event.subscribe`, `event.emit`, `registerAction`, and `deleteActionsTargeting`. All public API. The framework has zero compound-awareness.

`any` would be a similar function with `required: 1` and a different cleanup pattern (kill all siblings on first fire). Same primitives.

## End-to-end flows

### Flow 1 — cron launches an agent (unchanged)

```
agents plugin handler:
  await createCronTrigger({
    cronExpr: "0 9 * * *",
    action: "agents.launch",
    config: { agentId: A.id },
  })

[9:00 next morning, scheduler tick]
  → fires action `agents.launch` with config { agentId: A.id }
  → handleLaunch(A.id)

[Agent A is deleted]
  await deleteActionsTargeting("agents.launch", { agentId: A.id })
```

### Flow 2 — conversation completes → launch reviewer (simplified, no spawnedBy)

```
User configures: "when conversation C finishes, launch reviewer R".
  await conversationCompleted.subscribe({
    conversationId: C.id,
    action: "agents.launch",
    config: { agentId: R.id, prompt: "review" },
    oneShot: false,
  })

[Conversation C finishes]
  poller: updateConversation(C.id, { status: "gone", endedAt: new Date() })
  poller: await conversationCompleted.emit({ conversationId: C.id })
  → SQL probe matches our row → fires agents.launch

[Conversation C is deleted from the DB]
  → FK cascade removes the trigger row automatically.

[Agent R is deleted]
  await deleteActionsTargeting("agents.launch", { agentId: R.id })
```

For "trigger on every conversation that finishes" (no specific id), pass no `conversationId`. For "trigger on conversations matching a richer condition", filter inside the action handler.

### Flow 3 — task done → launch queued child (one-shot)

```
User clicks "Create & queue" on parent X for child Y:
  Y = createTask({ parentId: X.id, title: "Y" })
  await taskCompleted.subscribe({
    taskId: X.id,
    action: "tasks.launch",
    config: { taskId: Y.id },
    // oneShot defaults to true
  })

[X transitions to done — see emit-site discipline below]
  await taskCompleted.emit({ taskId: X.id, parentId: X.parentId, status: "success" })
  → fires tasks.launch → createConversation for Y
  → oneShot=true → row deleted

[X is deleted instead of completing]
  → FK cascade removes the trigger row.
```

### Flow 4 — compound: when X done AND Y done, launch Z (new in v5)

```
await compound({
  all: [
    { event: taskCompleted,         match: { taskId: X.id } },
    { event: conversationCompleted, match: { conversationId: Y.id } },
  ],
  action: "agents.launch",
  config: { agentId: Z.id },
});

  → compound() inserts:
    _compound_states (id=G, required=2, fired_ids='{}')
    _task_completed_triggers (task_id=X.id, action='compound.step', config={groupId:G, childId:'0'})
    _conversation_completed_triggers (conversation_id=Y.id, action='compound.step', config={groupId:G, childId:'1'})
    _compound_completed_triggers (group_id=G, action='agents.launch', config={agentId:Z.id})

[X done]
  → taskCompleted.emit fires → compound.step({groupId:G, childId:'0'})
  → fired_ids = ['0'], length 1 < required 2 → no-op

[Y done]
  → conversationCompleted.emit fires → compound.step({groupId:G, childId:'1'})
  → fired_ids = ['0','1'], length 2 >= required 2
  → compoundCompleted.emit({groupId:G}) → matches _compound_completed_triggers row
  → fires agents.launch({agentId:Z.id})
  → cleanup: DELETE _compound_states WHERE id=G (FK cascade kills _compound_completed_triggers row)
  → cleanup: deleteActionsTargeting("compound.step", { groupId: G })  (siblings; though both have already fired+been deleted by oneShot, this also covers the partial-fire case)

[X is deleted before Y completes]
  → FK cascade removes the X-side trigger row.
  → _compound_states row for G is now stranded — see "open questions".
```

## Emit-site discipline (unchanged)

The plugin that owns the state mutates a row and emits in the same function. Same contract as `resource.notify()`.

- **`conversationCompleted`** — emit from [`plugins/conversations/server/internal/poller.ts:92`](../plugins/conversations/server/internal/poller.ts) right after `await updateConversation(id, { status: "gone", endedAt: new Date() })`.
- **`taskCompleted`** — task `status` is **derived** in `tasks_v` from completed attempts, so the emit must fire from each write that *causes* the not-done→done transition (`insertPush` in `pushes.ts`, `updateTask({ drop: true })` in `tasks.ts`), with a re-derive check post-write. The cleaner long-term alternative is an explicit `_tasks.completedAt` column — flagged but out of scope.

If a code path mutates state outside the plugin's API and skips the emit, no event fires. Caller bug, not a framework gap.

## Dispatch (unchanged from v4)

### `event.subscribe()` insertion path

The `subscribe` method splices the user-provided filter columns + base columns (action, config, oneShot, enabled) into the event's table and inserts. One INSERT, returns the row id.

### `event.emit()` query path

```sql
-- e.g. for taskCompleted.emit({ taskId: 'X' }):
SELECT * FROM task_completed_triggers
 WHERE enabled AND (task_id IS NULL OR task_id = 'X')
```

Hits a partial index on `(task_id) WHERE enabled`. O(matches). For each row: look up `actionName` in the in-memory action registry, call with `actionConfig`, then if `oneShot` delete the row.

### Cron poller (unchanged)

`setInterval(tickOnce, 5_000)` started from the events plugin's `onReady`. Modeled on [`plugins/tasks/server/internal/push-watcher.ts:131`](../plugins/tasks/server/internal/push-watcher.ts) and [`plugins/conversations/server/internal/poller.ts:129`](../plugins/conversations/server/internal/poller.ts).

```sql
SELECT * FROM cron_triggers
 WHERE enabled AND next_run_at <= now()
 ORDER BY next_run_at LIMIT 100 FOR UPDATE SKIP LOCKED
```

`cron-parser` returns "next from now", so a long downtime fires once on resume.

## File layout

```
plugins/events/
├── server/
│   ├── index.ts                      # ServerPluginDefinition; onReady starts cron scheduler
│   ├── api.ts                        # defineEventType, registerAction, createCronTrigger,
│   │                                 # deleteActionsTargeting, eventTriggerColumns, ActionContext
│   └── internal/
│       ├── tables.ts                 # _cron_triggers
│       ├── dispatch.ts               # runAction: registry lookup, oneShot delete, error log
│       ├── registry.ts               # in-memory action map + table registry
│       │                             # (used by deleteActionsTargeting to scan all event-trigger tables)
│       └── cron-scheduler.ts         # setInterval poller
│
└── plugins/compound/                 # (or a sibling top-level plugin)
    └── server/
        ├── api.ts                    # compoundCompleted EventType, compound.step action,
        │                             # compound() orchestrator
        └── internal/
            └── tables.ts             # _compound_states, _compound_completed_triggers

plugins/tasks-core/
└── server/
    ├── api.ts                        # taskCompleted, conversationCompleted EventTypes
    │                                 # + tasks.launch action
    └── internal/
        ├── tables.ts                 # ...existing + _task_completed_triggers,
        │                             # _conversation_completed_triggers
        └── mutations/                # emit() at the right transition points

plugins/agents/
└── server/
    └── api.ts                        # registers agents.launch action wrapping handleLaunch
```

## Open questions

These are the unresolved bits that need a decision before implementation. They're not blockers for the overall shape, but each could shift parts of the API or storage.

1. **Compound orphan cleanup.** When a child target (e.g. task X) is deleted before all siblings fire, FK cascade removes the X-side trigger row. The `_compound_states` row is now stranded — the surviving Y-side will never reach `required`. Options:
   - Accept the orphan (cheap rows, ignorable).
   - Add a periodic GC pass in the cron scheduler that drops `_compound_states` whose `fired_ids` count + surviving sibling count < `required`.
   - DB-level trigger on event-trigger tables that calls a cleanup function. Project doesn't currently use DB triggers — would be a new pattern.
   - Lean: option 1 for v1, add option 2 if it ever matters.

2. **Where does the compound plugin live?** As a nested plugin under `events` (`plugins/events/plugins/compound`), or as a sibling top-level plugin (`plugins/compound`)? Nested means it's clearly an extension; top-level means events stays minimal. Probably nested, but not load-bearing.

3. **`deleteActionsTargeting` table discovery.** It needs to scan all event-trigger tables. Two ways:
   - Each event-trigger table self-registers when its plugin loads (via `defineEventType` side effect — the events plugin's registry knows about it).
   - Hardcoded list maintained in events plugin (fragile).
   - Lean: self-register via `defineEventType`. Each `EventType` already references its `table`; the registry is just `Map<eventName, EventType>` plus iteration when needed. `_cron_triggers` is added at module load.

4. **Type-safety of `compound()`'s `match` per child.** Each entry in `all: [...]` has its own `match` shape (typed against that child's `EventType<T, S>`). With variadic generics this can be inferred per-tuple-element, but the type may get gnarly. Acceptable to start with `match: any` and tighten later, or invest in the typing now? Lean: tighten now if it's <20 lines of inference; otherwise punt.

5. **Cron + event composition.** Should `compound()` accept cron items in its `all`? "Every weekday at 9am AND task X is done." Currently no — `compound` only takes events. A future `compound()` extension could take `{ cron: '...' }` items by inserting them into `_cron_triggers` with `compound.step` as the action; cron firing would then be just another way to fire `compound.step`. Lean: defer until a real use case.

6. **What does `taskCompleted` actually fire on?** Drop, hold, push-completed-attempt, all of the above? Pragmatically depends on what "Create & queue" should treat as completion. Tied to the broader question of whether tasks should grow a `completedAt` column. Out of scope for the events doc but blocks the third end-to-end flow.

7. **Subscribe-filter typing.** `EventType<T, S>` requires the table author to declare `S` (the typed filter shape) in addition to `T` (the payload type). Could `S` be inferred from the table's column shape? Probably yes with `$inferSelect`, but verbose. Lean: declare `S` explicitly, document the convention.

## Verification (carries forward from v4, plus compound)

1. Cron flow — unchanged from v4.
2. Single-event one-shot — `taskCompleted.subscribe({ taskId: X.id, ... })`, mark X done, verify action fires + row deleted.
3. Single-event recurring — same with `oneShot: false`, verify fires twice.
4. FK cascade cleanup — delete X, verify `task_completed_triggers` row gone.
5. Action-target cleanup — `deleteActionsTargeting("agents.launch", { agentId: A.id })` removes rows across all event-trigger tables AND `_cron_triggers`.
6. Cron miss-on-restart — unchanged from v4.
7. **Compound (new):** create a 2-of-2 compound, fire one child (no action), fire second child (action fires, state row + sibling rows cleaned up).
8. **Compound idempotency (new):** fire the same child twice, verify `fired_ids` stays a set (no double-count, action only fires when distinct children reach threshold).
9. **Compound orphan (new):** create a 2-of-2 compound, delete one child's target. Verify behavior matches whichever cleanup option (1/2/3 above) is chosen.

## Why this is "v5 working draft" and not "v5 final"

The shape feels right — three primitives at the right layers, compound as a clean plugin, no framework knowledge of compounds, FK cascade doing the cleanup work. But several items in "open questions" need decisions before this can be implemented, and the `taskCompleted` emit-site question (#6) might force changes to `tasks-core` that ripple into the events doc.

Treat this as the latest checkpoint, not the spec.
