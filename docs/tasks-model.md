# Tasks, attempts, conversations, pushes

The mental model behind Singularity's core entities and their statuses.

## The four entities

| Entity           | Owns                                                          |
| ---------------- | ------------------------------------------------------------- |
| **Task**         | The goal. Nested. Can be dropped by the user.                 |
| **Attempt**      | One try at a task. Owns a worktree on disk.                   |
| **Conversation** | One Claude session. Owns the runtime process (tmux / agent).  |
| **Push**         | A git-push event observed inside an attempt.                  |

```
task  1──*  attempt  1──*  conversation
               │
               └──────*  push
```

- A task is the unit of intent ("fix the diff renderer").
- An attempt is a concrete try, 1:1 with a worktree directory on disk (`claude-<ts>`). If the first attempt fails and you retry, a new attempt is created.
- A conversation is a running Claude session inside an attempt. Today each attempt has exactly one conversation; the model leaves room for many.
- A push is recorded when commits authored inside an attempt land on `main`. It's the "shipped" signal.

## Ground-truth vs derived state

Five write sites are the entire mutation surface. Everything else is computed by a Postgres view.

| Field                         | Writer                                                  |
| ----------------------------- | ------------------------------------------------------- |
| `_conversations.status`       | Runtime adapter (tmux poller today, Agent SDK next).    |
| `_conversations.ended_at`     | Written alongside the transition to `gone`.             |
| `_tasks.dropped_at`           | User action (drop button) only.                         |
| `pushes` row insert           | Push-watcher (detects new commits on `main`).           |
| `_tasks`/`_attempts`/`_conversations` CRUD | Handlers on create / delete.               |

Every other status or timestamp is a column in a `pgView` (`tasks_v`, `attempts_v`, `conversations_v`), derived from the above. No handler ever writes a status field.

## Status vocabularies

### Conversation — `starting` → `working` → `waiting` → `gone`

The only stored status. Owned by the runtime:

- `starting` — process spawning / worktree warming.
- `working` — Claude is actively computing.
- `waiting` — Claude is paused for user input or a permission prompt.
- `gone` — the process has exited (any cause). Terminal. `ended_at` is stamped at the same instant.

Derived: `active = status <> 'gone'`.

### Attempt — `pending` · `in_progress` · `pushed` · `completed` · `abandoned`

Purely derived from conversations and pushes:

```
has_conv      = any conversation exists for this attempt
has_live_conv = any conversation exists and is NOT gone
has_push      = any push row exists for this attempt
```

```
pending      = no conversation yet (attempt was created, nothing ran)
in_progress  = a live conversation is running, no push yet
pushed       = a live conversation is running AND a push has landed
completed    = every conversation is gone AND a push has landed  (shipped)
abandoned    = every conversation is gone AND no push            (stalled)
```

Derived: `active = pending | in_progress | pushed` (everything pre-terminal).

`finished_at` = earliest push time for completed attempts, else the latest conversation `ended_at` for abandoned ones, else NULL.

### Task — `new` · `in_progress` · `attempted` · `done` · `dropped`

Derived from attempts, with the user's drop timestamp winning over everything:

```
dropped      = user set _tasks.dropped_at   (user intent always wins)
done         = any attempt reached 'completed'
in_progress  = any attempt is active
attempted    = there's been at least one attempt, but none active and none completed (stalled)
new          = no attempt yet
```

Derived: `active = status = 'in_progress'`.

`finished_at` = `dropped_at` for dropped tasks, earliest push time for done tasks, else NULL.

### Why `dropped` (task) vs `abandoned` (attempt)?

Two different mechanisms, different words on purpose:

- **Abandoned** is auto-derived: "all conversations on this attempt went gone without a push." Can happen silently when someone just closes a tmux pane.
- **Dropped** is an explicit user action on a task: "this isn't worth pursuing." Wins over any attempt state, so a dropped task stays dropped even if a lingering attempt later produces a push.

The distinct vocabulary keeps the UX unambiguous.

## Cascade

Resources form a DAG via `dependsOn`. One upstream `notify()` cascades through in a single microtask flush:

```
conversationsResource
  ↑ notified by: runtime poller on status change, handlers on create/delete
  ↓ feeds: attemptsResource

pushesResource
  ↑ notified by: push-watcher
  ↓ feeds: attemptsResource

attemptsResource        (loader: SELECT * FROM attempts_v)
  ↓ feeds: tasksResource

tasksResource           (loader: SELECT * FROM tasks_v)
```

A conversation going `gone` → `conversationsResource.notify()` → `attemptsResource` re-loads (attempt flips `in_progress → abandoned` or `pushed → completed`) → `tasksResource` re-loads (task flips to `attempted` or `done`). Every badge downstream updates from one trigger.

## Schema layout

Each plugin splits its Drizzle schema in two:

- **`server/schema_internal.ts`** — physical `pgTable` definitions for entities that have a derived view. Names are underscore-prefixed (`_tasks`, `_attempts`, `_conversations`). Only in-plugin writers import from here.
- **`server/schema.ts`** — `pgView` definitions (`tasks`, `attempts`, `conversations`), plain tables with no derivation (e.g. `pushes`), Zod schemas, TypeScript types. All cross-plugin consumers import from here.

A plugin's public `api.ts` re-exports from `schema.ts` only. The internal file is never exported to other plugins.

This is enforceable: a check rule forbids cross-plugin imports of `schema_internal.ts`. Writers can only reach the underscored tables inside their own plugin; everyone else sees the unified view.

## Where to read more

- `research/2026-04-16-global-tasks-attempts-conversations-schema-v2.md` — the full schema redesign and migration plan.
- `research/2026-04-16-global-derived-state-primitive-v2.md` — the `pgView` + `dependsOn` primitive that makes the derivation possible.
- `server/CLAUDE.md` — resource / `dependsOn` conventions.
- `plugin-core/CLAUDE.md` — plugin schema conventions.
