# Events, actions, triggers

The mental model behind the `events` plugin: how plugins react to state changes across plugin boundaries without direct coupling.

## The three entities

| Entity      | Owns                                                                            |
| ----------- | ------------------------------------------------------------------------------- |
| **Event**   | A named fact a plugin emits when its state transitions (e.g. `tasks.completed`). |
| **Action**  | A named typed handler registered once at plugin load (e.g. `agents.launch`).    |
| **Trigger** | A persisted row linking a source's filter to an action's config.                |

```
         emit(payload)              dispatch
event  ───────────────►  [row]  ───────────────►  action.run(config, ctx)
 ▲                         ▲
 │                         │ trigger({ on, do })
 │                         │
 └── defined by plugin     └── inserted by subscriber
```

One plugin emits an event from its mutation site (same contract as `resource.notify()`). Any plugin can subscribe by calling `trigger({ on: <source>, do: <action>(config) })`, which persists a row in the event's per-type table. When the event fires, the dispatcher scans rows whose filter matches the payload and invokes each row's action.

## Public API — five exports

```ts
// Event owner declares the event (with typed filter columns).
const { event, table } = defineTriggerEvent<Payload>({ name, filters });

// Action owner declares the handler (with a zod config schema).
const launchAgent = defineAction({ name, config: zodSchema, run });

// Subscriber persists the binding.
await trigger({ on: event.where({ taskId: X }), do: launchAgent({ agentId: A }) });

// Cleanup — by id, or by sweeping every row targeting a specific config shape.
await deleteTrigger(id);
await launchAgent.deleteTargeting({ agentId: A });
```

`event` is dual-purpose: it has `.emit(payload)` for the owner and it *is* a `Source` for subscribers (match-any if used bare, filtered via `.where`). Actions are typed factories — `launchAgent({...})` returns an `ActionRef` for `do:` and `launchAgent.deleteTargeting({...})` sweeps by JSONB containment. The string name (`"agents.launch"`) is the stable DB identifier; callers never type it.

## Flow at wire level

```
1. subscriber:  trigger({ on: taskCompleted.where({ taskId: "X" }),
                           do:   launchAgent({ agentId: "A" }),
                           oneShot: true })
                → INSERT INTO task_completed_triggers (task_id, action_name, action_config, one_shot)
                  VALUES ('X', 'agents.launch', '{"agentId":"A"}', true)

2. owner:       taskCompleted.emit({ taskId: "X", parentId: ..., status: "success" })
                → SELECT * FROM task_completed_triggers
                   WHERE enabled AND (task_id IS NULL OR task_id = 'X')

3. dispatcher:  for each row:
                  - lookup row.action_name in the in-memory action registry
                  - safeParse row.action_config with the action's zod schema
                  - call action.run(parsed, { payload, triggerId, table })
                  - if row.one_shot: DELETE WHERE id = row.id
```

Rows are processed in parallel (`Promise.all`); no ordering guarantee between subscribers.

## Filter semantics

Filter columns are declared per event in `defineTriggerEvent`. Each is nullable; **NULL means "don't filter on this dimension"**, so a subscriber who omits a filter key matches every emit.

**Plain column (the 95% case).** Default match is `col IS NULL OR col = payload[key]`. Same payload key → same column.

```ts
filters: {
  taskId: text("task_id").references(() => _tasks.id, { onDelete: "cascade" }),
}
```

**Object form (custom predicate).** Each filter can declare its own null-tolerant match, AND-ed with the others. Any SQL is fair game:

```ts
filters: {
  minFilesChanged: {
    column: integer("min_files_changed"),
    match: (col, p) => or(isNull(col), gte(p.filesChanged, col)),
  },
}
```

**Cross-column (rare).** Top-level `matchFn` overrides per-filter predicates with a single WHERE clause that can touch multiple columns.

## Preservation policy — rows outlive type definitions

`action_config` is stored as JSONB; it outlives whatever TS type wrote it. Two things can go wrong at dispatch; both preserve the row rather than deleting it, so the situation is recoverable:

| At dispatch | Observable behavior                                                |
| ----------- | ------------------------------------------------------------------ |
| Action name not in the registry (plugin removed) | Log warning, skip, **row preserved** — re-adding the plugin picks it up. |
| `safeParse` fails (config drift across deploys)  | Log warning, skip, **row preserved** — fixing the config or reverting the schema recovers it. |
| Handler throws                                   | Log error, skip, **row preserved** (oneShot delete only happens on success). |

## Cleanup paths

Three ways a trigger row goes away. Every plugin gets them for free.

| Path                         | Mechanism                                                                 |
| ---------------------------- | ------------------------------------------------------------------------- |
| **Target deleted**           | FK `ON DELETE CASCADE` on the filter column. Declare it when you wire the event. |
| **Action target deleted**    | From the target plugin's delete handler, call `action.deleteTargeting({ <key>: id })`. JSONB `@>` sweeps every trigger table. |
| **Subscriber changes mind**  | `deleteTrigger(id)` — UUIDs are globally unique, so the helper iterates the trigger-table registry. |
| **One-shot fired**           | Automatic: dispatcher deletes the row after a successful handler call when `one_shot = true`. |

## Storage model

Every trigger table has the same base columns, added automatically by `defineTriggerEvent`:

| Column          | Type                     | Purpose                                         |
| --------------- | ------------------------ | ----------------------------------------------- |
| `id`            | uuid PK, default random  | Row id; unique across all trigger tables.       |
| `action_name`   | text                     | Looked up in the action registry at dispatch.   |
| `action_config` | jsonb                    | Passed to handler after zod parse.              |
| `enabled`       | boolean, default true    | Soft-disable without delete.                    |
| `one_shot`      | boolean, default true    | Delete after successful fire.                   |
| `created_at`    | timestamptz, default now | For debugging / ordering.                       |

Plus one nullable column per declared filter, each with a partial index `WHERE enabled` so dispatch stays O(matches) even with thousands of disabled rows.

Table name = `<event_name_with_dots_to_underscores>_triggers` (e.g. `tasks.completed` → `task_completed_triggers`). Each event's table is a top-level `PgTable` export — drizzle-kit's schema walker doesn't recurse into nested properties, so `{ event, table }` is destructured at the call site:

```ts
export const { event: taskCompleted, table: _taskCompletedTriggers } =
  defineTriggerEvent<TaskCompletedPayload>({ ... });
```

The barrel in `server/src/db/schema.ts` picks `_taskCompletedTriggers` up via the existing `export * from "@plugins/.../internal/tables"` line. No per-event migration wiring.

## Emit-site discipline

The one load-bearing contract: **the plugin that owns the state emits from the same function that mutates it.** Same pattern as `resource.notify()`. If a future code path mutates state outside the plugin's API and skips the emit, no event fires — that's a caller bug, not a framework gap.

For derived state (e.g. `tasks_v.completedAt` isn't a column, it's a view projection), emit from each write that *causes* the transition and re-derive status post-write so you only emit on the actual flip.

## Extension points (deferred)

`trigger({ on: ... })` accepts any `Source`. Today there's one kind (`EventSource`); the shape is ready for:

- **Compound (`And`, `Or`, N-of-M)** — a source that composes event sources. Implementable as ~40 lines in a separate `events/plugins/compound/` plugin using only public primitives: a state table tracking `fired_ids`, child triggers whose action is `compound.step`, and a `compoundCompleted` event that the user-visible trigger subscribes to. Framework needs zero new code.
- **Cron** — `Cron("0 9 * * *")` produces a `CronSource`; `trigger({ on: cronSource, do })` inserts into a `_cron_triggers` table driven by a separate scheduler loop. Mixed cron + event compounds fall out of the `Source` abstraction for free.

Both were designed alongside v1 and are intentionally out of the v1 API surface. See the v6 design doc for the full compound walkthrough.

## Where to read more

- [`research/2026-04-23-plugins-events-v1.md`](../research/2026-04-23-plugins-events-v1.md) — current implementation spec.
- [`research/2026-04-23-global-events-triggers-api-v6.md`](../research/2026-04-23-global-events-triggers-api-v6.md) — design document covering compound, cron, and end-to-end workflows that v1 defers.
- [`tasks-model.md`](tasks-model.md) — the status vocabularies the first production events (`tasks.completed`, `conversations.completed`) will emit against.
- [`abstractions.md`](abstractions.md) — high-level map of all generic systems, including this one.
