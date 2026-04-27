# Events & Triggers API — v3 (minimal design)

> Supersedes [v2](./2026-04-22-global-events-triggers-api-v2.md). Same use cases, same wake-up paths, much smaller surface. v3 cuts everything that wasn't load-bearing for the three concrete flows (cron-launches-agent, conversation-done-launches-review, task-done-launches-queued-child).

## What's cut from v2

| v2 | v3 | Why |
|---|---|---|
| Ephemeral `event.on` / `event.once` | removed | `resources.notify` already covers in-process reactivity. Emit callers that want to do work just run code inline. |
| `match_keys JSONB` + `<@` subset match | single `match_value TEXT` | Every real use case filters on one key (`taskId`, `conversationId`, `agentId`). Multi-key was speculative. |
| Per-key expression indexes + codegen | one `(event_name, match_value)` index | Follows from single-key matching. |
| `fires_remaining INTEGER` | `one_shot BOOLEAN` | Nobody asked for "fire N times"; one-shot vs. recurring covers the space. |
| `owner_kind` + `owner_id` + cascade rule | removed | Plugins clean up by filtering on `action_config` when their owning row is deleted. One line per plugin. |
| Zod payload validation at `emit` / action `run` | plain TS generics | UI handlers validate user input at the HTTP boundary where Zod already lives. Dispatch hot path stays type-only. |
| Separate `event_subscriptions` + `cron_subscriptions` tables | one `triggers` table with `kind` discriminator | Two kinds, ~8 columns total — clearly legible. One migration, one query layer. |
| Compound (`all`/`any`) triggers | still deferred (unchanged) | — |

## Storage — one table

```ts
// plugins/events/server/internal/tables.ts
export const _triggers = pgTable('_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').$type<'event' | 'cron'>().notNull(),

  // event kind:
  eventName: text('event_name'),       // e.g. 'tasks.completed'
  matchValue: text('match_value'),     // NULL = match any emit of this event
  oneShot: boolean('one_shot').notNull().default(true),  // event triggers default one-shot

  // cron kind:
  cronExpr: text('cron_expr'),
  nextRunAt: timestamp('next_run_at'),
  lastRunAt: timestamp('last_run_at'),

  // both kinds:
  actionName: text('action_name').notNull(),
  actionConfig: jsonb('action_config').$type<Record<string, unknown>>().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('triggers_event_idx')
    .on(t.eventName, t.matchValue)
    .where(sql`kind = 'event' AND enabled`),
  index('triggers_cron_idx')
    .on(t.nextRunAt)
    .where(sql`kind = 'cron' AND enabled`),
]);
```

Two partial indexes, each covering exactly one dispatcher. Nullable fields on "the other side" never participate in a query — the `WHERE kind = 'event'` / `kind = 'cron'` partial filter keeps the index small and the query plans unambiguous.

## API — three functions, plain TS

```ts
// plugins/events/server/api.ts

// 1. Declare an event. TypeScript generic only — no Zod.
export interface EventDef<T> { name: string; key: (keyof T & string) | null; }
export function defineEvent<T>(name: string, key: (keyof T & string) | null): EventDef<T> {
  return { name, key };
}

// 2. Register an action. Plain function handler, plain config type.
interface ActionHandler<C = any> { (config: C, ctx: ActionContext): Promise<void> | void; }
const actions = new Map<string, ActionHandler>();
export function registerAction<C>(name: string, run: ActionHandler<C>) {
  actions.set(name, run as ActionHandler);
}

// 3. Emit. One call site per state change.
export async function emit<T>(event: EventDef<T>, payload: T): Promise<void> {
  const matchVal = event.key ? String(payload[event.key] ?? '') : null;
  const subs = await db.select().from(_triggers).where(and(
    eq(_triggers.kind, 'event'),
    eq(_triggers.enabled, true),
    eq(_triggers.eventName, event.name),
    // match_value IS NULL (match-any) OR equals this event's key value
    or(isNull(_triggers.matchValue), eq(_triggers.matchValue, matchVal ?? '')),
  ));
  await Promise.all(subs.map(s => runAction(s, payload)));
}

// 4. Create a persistent trigger — thin INSERT wrapper.
export async function createTrigger(spec:
  | { kind: 'event'; event: EventDef<any>; matchValue?: string | null; action: string; config: object; oneShot?: boolean }
  | { kind: 'cron';  cronExpr: string; action: string; config: object }
): Promise<string> { /* INSERT and return id */ }
```

`ActionContext` is `{ payload: unknown; triggerId: string }` — the bare minimum so an action can introspect which row fired it. No DB handle: actions import Drizzle + their callees directly, same as every other plugin.

## Dispatch — same two wake-ups

### Path A — `emit()` (event triggers)

One SQL query per emit:

```sql
SELECT * FROM _triggers
 WHERE kind = 'event' AND enabled
   AND event_name = $1
   AND (match_value IS NULL OR match_value = $2)
```

Hits `triggers_event_idx` directly. O(matches). For each row: run the action, then if `one_shot` delete the row.

**No multi-key matching.** If a plugin needs "match on conversationId *and* agent", it either (a) picks the more selective key and filters in the action, or (b) emits a compound event with the join already encoded in `match_value` (e.g. `conversationId:agentId`). Both are fine escape hatches; neither requires schema complexity.

### Path B — cron scheduler (`setInterval`)

Identical to v2 — kept because it's already minimal. Single `setInterval(tickOnce, 5_000)` started from the plugin's `onReady`. The tick:

```sql
SELECT * FROM _triggers
 WHERE kind = 'cron' AND enabled AND next_run_at <= now()
 ORDER BY next_run_at LIMIT 100 FOR UPDATE SKIP LOCKED
```

Advance `next_run_at = cronParser.parseExpression(expr).next()`, update `last_run_at = now()`, run the action. `cron-parser` returns "next from now", so a long downtime fires once on resume — not N replays.

## End-to-end flows

### Flow 1 — cron launches an agent

```
Agent A is created with cron '0 9 * * *'.
 ↓ agents plugin:
    createTrigger({ kind: 'cron', cronExpr: '0 9 * * *',
                    action: 'agents.launch', config: { agentId: A.id } })
 ↓ events plugin: INSERT _triggers (kind='cron', next_run_at = next 9am, ...)

[9:00 next morning]
 ↓ cron scheduler tick claims the row, advances next_run_at to tomorrow 9am
 ↓ actions.get('agents.launch')({ agentId: A.id }, { payload: null, triggerId })
 ↓ handleLaunch(A.id)  — same existing code path

[Agent A is deleted]
 ↓ agents plugin's delete handler:
    DELETE FROM _triggers WHERE action_name='agents.launch' AND action_config->>'agentId' = A.id
```

### Flow 2 — conversation completes → launch review agent

```
User configures review trigger on agent A.
 ↓ createTrigger({ kind: 'event',
                   event: conversationCompleted,
                   matchValue: A.id,        // filter: payload.spawnedBy === A.id
                   action: 'agents.launch',
                   config: { agentId: R.id, prompt: 'review' } })

[conversation C spawned by A finishes]
 ↓ conversations plugin's markCompleted(C):
    await updateConversation(C, { status: 'done' })
    await emit(conversationCompleted, { conversationId: C.id, spawnedBy: A.id, ... })
 ↓ emit's one SQL probe:
    SELECT ... WHERE event_name='conversations.completed'
             AND (match_value IS NULL OR match_value='A.id')
 ↓ actions.get('agents.launch')({ agentId: R.id, prompt: 'review' }, ...)
 ↓ handleLaunch(R.id, { prompt: 'review' })
 ↓ oneShot=false → row stays; next time A spawns a conversation that completes, fires again.
```

`conversationCompleted` is declared with `key: 'spawnedBy'`, so `match_value` is that field's string. If the user instead wanted "only when *this specific conversation* finishes", they'd redeclare with `key: 'conversationId'` — or use a different event. One key per event, no composition.

### Flow 3 — task done → launch queued child

```
User clicks "Create & queue" on parent X for child Y.
 ↓ tasks plugin:
    createTask({ parentId: X.id, title: 'Y' }) → Y
    createTrigger({ kind: 'event',
                    event: taskCompleted,
                    matchValue: X.id,
                    oneShot: true,             // default for events
                    action: 'tasks.launch',
                    config: { taskId: Y.id } })

[X marked done]
 ↓ updateTask(X, { status: 'done' })
 ↓ await emit(taskCompleted, { taskId: X.id, ... })
 ↓ SELECT matches our row (match_value = X.id)
 ↓ tasks.launch({ taskId: Y.id }) → createConversation for Y
 ↓ oneShot=true → DELETE row

[User cancels queue before X completes]
 ↓ DELETE FROM _triggers WHERE action_name='tasks.launch' AND action_config->>'taskId' = Y.id
```

## Emit discipline (unchanged from v2)

The tasks/conversations/agents plugin code that mutates a row is the same code that must `await emit(...)`. No changefeed, no trigger that listens to the DB. If someone mutates state outside of plugin API functions, no event fires — that's a caller bug, not a framework gap. Same contract as `resources.notify()`.

## API recap

```ts
// --- defined once per plugin that produces events/actions ---

// tasks plugin:
export const taskCompleted = defineEvent<{ taskId: string; parentId: string | null; status: 'success'|'failure' }>(
  'tasks.completed', 'taskId'
);
registerAction<{ taskId: string; prompt?: string }>('tasks.launch', async (cfg) => {
  await createConversation({ taskId: cfg.taskId, prompt: cfg.prompt ?? '' });
});

// agents plugin:
registerAction<{ agentId: string; prompt?: string }>('agents.launch', async (cfg) => {
  await handleLaunch(cfg.agentId, { prompt: cfg.prompt });
});

// --- called at the mutation site ---
await updateTask(X.id, { status: 'done' });
await emit(taskCompleted, { taskId: X.id, parentId: X.parentId, status: 'success' });

// --- called when something should happen later ---
await createTrigger({
  kind: 'event', event: taskCompleted, matchValue: X.id,
  action: 'tasks.launch', config: { taskId: Y.id },
});
await createTrigger({
  kind: 'cron', cronExpr: '0 9 * * *',
  action: 'agents.launch', config: { agentId: A.id },
});
```

## File layout

```
plugins/events/
├── server/
│   ├── index.ts                    # ServerPluginDefinition, onReady starts cron-scheduler
│   ├── api.ts                      # defineEvent, registerAction, emit, createTrigger
│   └── internal/
│       ├── tables.ts               # _triggers (single table)
│       └── cron-scheduler.ts       # setInterval poller
```

Down from v2's 5 internal files.

## Critical files / references

- `plugins/events/server/internal/tables.ts` — **new**: single `_triggers` table above.
- `plugins/events/server/api.ts` — **new**: `defineEvent`, `registerAction`, `emit`, `createTrigger`.
- `plugins/events/server/internal/cron-scheduler.ts` — **new**: modelled on [`plugins/tasks/server/internal/push-watcher.ts:131`](../plugins/tasks/server/internal/push-watcher.ts).
- `plugins/tasks/server/api.ts` — declare `taskCompleted` + `tasks.launch` action.
- `plugins/conversations/server/api.ts` — declare `conversationCompleted`; call `emit` in `lifecycle.markCompleted` ([`plugins/conversations/server/internal/lifecycle.ts:34`](../plugins/conversations/server/internal/lifecycle.ts)).
- `plugins/agents/server/api.ts` — declare `agents.launch` action wrapping [`plugins/agents/server/internal/handle-launch.ts:21`](../plugins/agents/server/internal/handle-launch.ts).
- `server/src/db/schema.ts` — add `export * from '@plugins/infra/plugins/events/server/schema'`.

## Deferred (same as v2)

- Compound `all`/`any` triggers — if the need appears, add a second event-kind subscription that fires a shared `compoundStep` action tracking a counter row. No schema change required beyond one extra table if/when we get there.
- Retries on action failure — v3 logs and continues. Retry/backoff is a separate design.
- Frontend-side events — resources cover UI reactivity.
- Cross-process dispatch — out of scope; single server per worktree.

## Verification

1. **Cron flow.** Create `*/1 * * * *` trigger with a no-op action. Watch `next_run_at` advance each minute, action fires within 5s.
2. **Event flow (one-shot).** Create a `{ event: taskCompleted, matchValue: X, oneShot: true }` trigger. Mark X done. Verify action fired, row deleted.
3. **Event flow (recurring).** Same but `oneShot: false`. Emit twice, action fires twice, row persists.
4. **Match-any vs match-value.** Two triggers on same event — one with `matchValue: 'X'`, one with `matchValue: null`. Emit with `taskId: 'X'` fires both; emit with `taskId: 'Y'` fires only the null-match one.
5. **Owner cleanup.** Delete an agent that has a cron trigger; confirm the plugin's delete handler removes the row.
6. **Missed cron on restart.** 20-minute downtime on a 5-minute cron → fires once on resume, not 4x.
7. **Index use.** `EXPLAIN` the emit query at 5k event triggers — Index Scan on `triggers_event_idx`, not seq scan.

Unit:
- `defineEvent<T>` type inference — `matchValue` constrained to `(keyof T & string)`.
- `emit()` — unknown event names don't throw (just empty result set).
- Cron `tickOnce` — missed-run behavior with a mocked clock; SKIP LOCKED under contention.
