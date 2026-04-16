# Task status derived from attempts

## Problem

A task's status today is ambiguous. The UI shows a status, but nothing
in the data model guarantees it reflects what's actually happening in
the task's work. Writers have to remember to update it whenever an
attempt transitions, a conversation starts or ends, or the task is
cancelled — and they don't, consistently. Status drifts.

The requirement is simple: **task status should be a function of the
task's attempts, not a column writers maintain.**

## Status definitions

Four values:

| Status        | Condition                                         |
|---------------|---------------------------------------------------|
| `todo`        | No active attempt exists.                         |
| `in_progress` | At least one attempt is currently active.         |
| `completed`   | The task has an attempt that ran to completion.   |
| `cancelled`   | Set manually by the user. Overrides the derived.  |

`cancelled` is the only stored status bit — a user-intent flag that
wins over anything derived. The other three are purely a function of
the attempt rows.

## Derivation rules

An attempt's liveness comes from its conversation (today, an attempt
*is* a single conversation — see
`2026-04-14-plugins-conversations-runtime-abstraction.md`). So the
dependency chain is:

```
conversation.phase  →  attempt (active / completed)  →  task.status
```

Concretely, per task:

1. If `cancelled = true` on the task row → **`cancelled`**.
2. Else if any attempt of the task has a conversation in a working
   phase → **`in_progress`**.
3. Else if any attempt of the task has a conversation that ran to
   completion → **`completed`**.
4. Else → **`todo`** (no attempts, or all attempts abandoned without
   completing).

## Why derived, not stored

If `task.status` is a column, every writer across three plugins
(`tasks`, `conversations`, the runtime) must remember to update it on
every transition. In practice that means:
- The status is correct right after it's set, drifts within hours.
- The only signal of drift is a user noticing a wrong badge.
- Every new transition path (cancel mid-attempt, resume a completed
  attempt, retry) is another opportunity to miss an update.

Declaring the status as a function of upstream state removes the
class. There is no writer to forget, because there is no write.

## Implementation

Uses the derived-state primitive from
`2026-04-16-global-derived-state-primitive-v2.md`:

- `_tasks` (physical table) keeps the stored columns, including the
  `cancelled` bit.
- `tasks` (the `pgView` consumers import) joins `_tasks` against
  `attempts` and `conversations`, computing `status` via a `CASE`
  over the four conditions above.
- `tasksResource` (`defineResource`) reads from the view and declares
  `dependsOn: [attemptsResource, conversationsResource]`, so any
  change upstream invalidates the resource automatically.

Shape (illustrative, full types in Drizzle at implementation time):

```ts
// plugins/tasks/server/schema.ts
export const _tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  cancelled: boolean("cancelled").notNull().default(false),
  // …stored columns
});

export const tasks = pgView("tasks_v").as((qb) =>
  qb.select({
    ...getTableColumns(_tasks),
    status: sql<"todo" | "in_progress" | "completed" | "cancelled">`
      CASE
        WHEN ${_tasks.cancelled}                       THEN 'cancelled'
        WHEN ${sql`… any attempt.conversation working`} THEN 'in_progress'
        WHEN ${sql`… any attempt.conversation done`}    THEN 'completed'
        ELSE 'todo'
      END
    `.as("status"),
  }).from(_tasks).leftJoin(/* attempts, conversations */)
);
```

```ts
// plugins/tasks/server/internal/resources.ts
export const tasksResource = defineResource({
  key: "tasks",
  mode: "push",
  dependsOn: [attemptsResource, conversationsResource],
  loader: () => db.select().from(tasks),
});
```

No writer in the codebase sets `status`. No path can produce a stale
badge.

## Open questions

- **"Active" vs "completed" signal source.** `attempts` table schema
  doesn't yet exist; today "an attempt is a conversation" is the
  working abstraction. The view's exact JOIN depends on whether
  attempts become their own table (with a FK to a conversation) or
  stay conflated. This is a prerequisite decision — either way the
  view body is small.
- **What counts as "working"?** `conversation.phase` currently takes
  values like `working`, `idle`, `done` (see
  `2026-04-15-conversations-phase-indicator.md`). The derivation
  needs a definitive list of phases that map to `in_progress` vs
  `completed` vs neither (an abandoned conversation that ran briefly
  then stopped → `todo`? or `completed`?). Clarify with the
  phase-indicator design.
- **Multiple attempts.** A retried task has >1 attempt. Current rules
  treat the task as `in_progress` if *any* attempt is active, and
  `completed` if *any* attempt ran to completion. Worth confirming
  this is the desired semantics, vs. "latest attempt wins."
- **Abandoned attempts.** An attempt whose conversation was opened
  then abandoned (no activity, no completion) — does the task go back
  to `todo`? Today the rules above say yes. Confirm.
- **Sub-task propagation.** Tasks are nested. Does a parent task's
  status aggregate its children's, or is it independent? Out of scope
  for this doc; noted for the task meta-plugin design.

## Why this problem matters beyond itself

`task.status` is the first concrete instance of the derivation problem
in the codebase. Solving it *with* the primitive rather than
one-off makes every subsequent derivation (`conversation.phase`,
`edited-files` count, future progress/pace indicators, any badge that
summarises nested state) a rote pattern instead of a design
conversation.

The win, ordered:

1. **Correct status, always.** The badge matches reality with no
   writer discipline.
2. **Pattern for the next ten problems.** The view + `dependsOn`
   shape is the reusable foundation.
3. **Swappable implementation.** If the JOIN ever gets slow, promote
   the view to `pgMaterializedView` with zero plugin code change.
