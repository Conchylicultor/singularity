# Events & Triggers API

## Context

The immediate need: when creating a sub-task from the conversation title plugin, offer a **"Create & queue"** button that auto-launches the child task once its parent completes. Today there is no mechanism for one task to react to another's state change — the existing `resources` DAG propagates live *state*, but not discrete *moments* (completed, failed, started, etc.).

Rather than hard-code `parent_complete` into the tasks plugin, we want a general substrate that:

- Lets any plugin **produce events** and any other plugin **consume them**, with end-to-end type safety.
- Lets end-users persist **triggers** (stored automations) that fire when events match — extensible to `cron`, multi-event joins, and future condition-based sources without schema churn per source.
- **Scales** to thousands of pending triggers without loading every row into memory on boot.

This plan covers only the public API surface. Internals (dispatch, indexing, persistence shape) are deferred to a follow-up plan once this API is approved.

## Relationship to existing infra

- Complements, does not replace, `server/src/resources.ts`. Resources model continuous state; events model discrete moments. They can interop later (a resource change can emit an event), but the primitives are distinct.
- Follows the plugin-contribution convention: each plugin exposes events/actions from its `server/api.ts` (the existing cross-plugin import boundary). No base class, no lifecycle hooks — events are data objects that plugins import directly.
- The only existing publish/subscribe (`plugins/logs/server/internal/registry.ts`) is log-specific and not reusable.

## API surface

Three layers: **Events**, **Actions**, **Triggers**.

### 1. Events — typed pub/sub

Plugins declare events as first-class values exported from `server/api.ts`. No global `EventMap`; the event handle itself carries its payload type.

```ts
export const taskCompleted = defineEvent({
  name: 'tasks.completed',
  payload: z.object({
    taskId: z.string(),
    parentId: z.string().nullable(),
    status: z.enum(['success', 'failure']),
  }),
  keys: ['taskId', 'parentId'], // explicit indexable fields
});
```

**`keys` is explicit, not inferred.** It is the producer's contract with the framework about which filter paths are indexed. Inferred keys would silently permit slow-path filters on arbitrary fields and create schema-evolution footguns.

**Producing**:
```ts
import { taskCompleted } from '@singularity/tasks/api';
await taskCompleted.emit({ taskId, parentId, status: 'success' });
```

**Consuming (in-process, ephemeral)** — for server code reacting while alive:
```ts
taskCompleted.on((p) => { /* typed payload */ });

taskCompleted.where({ parentId: 'abc' }).on(handler); // indexed filter

const off = taskCompleted.on(handler);
off();

const result = await taskCompleted.once({ where: { taskId: 'X' } }); // one-shot wait
```

Filter keys are type-restricted to the declared `keys` tuple — filtering on a non-key field is a compile error.

### 2. Actions — the "what happens" vocabulary

Plugins contribute named actions that triggers can invoke. Actions are how triggers connect back into plugin behavior.

```ts
export const launchTask = defineAction({
  name: 'tasks.launch',
  configSchema: z.object({ taskId: z.string() }),
  run(config, ctx) {
    return ctx.launchTask(config.taskId);
  },
});
```

Actions are registered into a global action registry keyed by `name`, so triggers persisted in the DB can refer to them by string while the TS types flow through.

### 3. Triggers — persistent event→action bindings

A trigger is a DB row with the shape `{ when, then }`. `createTrigger` is a thin insert; there is no per-trigger activation on boot.

```ts
await createTrigger({
  when: { event: taskCompleted, where: { taskId: 'parent-id' } },
  then: { action: launchTask, config: { taskId: 'child-id' } },
});
```

**`when` is a discriminated union of sources**, contributed via a plugin slot (`Triggers.Source`). Initial sources:

```ts
// Single event
when: { event: taskCompleted, where: { taskId: 'A' } }

// Conjunction / disjunction of event subscriptions
when: { all: [ {event, where}, {event, where} ] }
when: { any: [ ... ] }

// Cron (future source — adds no schema change, plugin-contributed)
when: { cron: '0 9 * * *' }

// Condition (future)
when: { condition: {...} }
```

This is the answer to the "one trigger = one event" limitation: triggers are not bound to a single event; `when` is a composable expression.

**Multi-event semantics** (to pin down before implementation):
- Ordering, windowing, and "each event once vs. repeatable" for `all`/`any` are open questions. V1 can ship with **single-event** and leave `all`/`any` as declared union variants without implementation.

### Usage matrix

| API | Purpose | Persistence |
|---|---|---|
| `event.on(handler)` | Plugin code reacting in-process (cache invalidation, side effects) | Ephemeral |
| `event.once({where})` | Workflow-style `await` for a specific event | Ephemeral |
| `createTrigger({when, then})` | User-configured automation ("Create & queue") | Persistent (DB row) |

## End-to-end example: "Create & queue"

1. `tasks` plugin exports `taskCompleted` event and `launchTask` action from `plugins/tasks/server/api.ts`.
2. User clicks **Create & queue** in the conversation title popover. UI calls `createTrigger({ when: { event: taskCompleted, where: { taskId: parentId } }, then: { action: launchTask, config: { taskId: newChildId } } })`.
3. A row is written to the `triggers` table. No other wiring.
4. When the parent task completes, the tasks plugin calls `taskCompleted.emit(...)`. The framework performs an indexed lookup on `triggers` matching the event's keys and invokes the bound actions.
5. `launchTask.run` executes → the queued child task starts.

No in-memory listener per queued task. Cancelling a queued task is `DELETE FROM triggers WHERE ...`.

## Plugin surface summary

What plugins contribute:
- `defineEvent` — emitted moments
- `defineAction` — invocable verbs
- `Triggers.Source` slot — new `when` variants (cron, webhook, condition) — each source owns its own indexing/dispatch strategy

What plugins do **not** need to do:
- Register per-trigger listeners on boot
- Maintain their own event bus
- Know about other plugins' triggers

## Open questions (deferred to implementation plan)

1. **Emit semantics** — does `emit` await all handlers, or fire-and-forget? Mixed model?
2. **Frontend events** — is this API server-only in v1, or does it extend over the WS channel to the web side (and if so, how does the `on` handle survive reconnects)?
3. **Multi-event windowing** — semantics of `all` / `any` (ordering, time window, replay safety).
4. **Action execution context** — what does `ctx` expose? (task launcher, DB handle, current trigger row?)
5. **Trigger lifecycle** — are triggers one-shot by default, or recurring? Who deletes them? Failure handling / retries.

## Critical files / references

- `server/src/types.ts` — `ServerPluginDefinition` shape; where the new primitives plug in.
- `server/src/plugins.ts` — plugin registry.
- `server/src/resources.ts` — adjacent reactive system; informs how dispatch + DAG ideas may apply.
- `plugins/tasks/server/api.ts` — canonical example of cross-plugin API export; where `taskCompleted` + `launchTask` will live.
- `plugins/tasks/server/schema.ts` — location for the new `triggers` table schema.
- `plugin-core/slots.ts`, `plugin-core/commands.ts` — pattern for contributing new `Triggers.Source` variants.
- `research/2026-04-15-global-sse-lifecycle-mental-model-v3.md` — prior art on live-state propagation.

## Verification

Design-only plan — no runtime changes in this phase. Next plan (internals) will include:
- Unit tests for `defineEvent`/`emit`/`on`/`where` typing (tsd).
- Integration test for the end-to-end "Create & queue" flow.
- Perf check: creating N triggers and emitting an event is O(matches), not O(N).
