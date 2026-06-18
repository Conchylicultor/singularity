# Container-task guard: meta/folder tasks must not own attempts

## Problem

`createConversation` (POST /api/conversations) accepts any `taskId` with no validation.
Passing a meta/folder task id (`task-meta-conversations`, `task-meta-system`,
`task-meta-agents`, `task-meta-improvements`, `task-meta-reports`) attaches an attempt
directly to the folder row instead of creating a child task, flipping the meta-folder's
computed status to `in_progress`. Structural footgun any caller can hit.

## Key facts (from exploration)

- A "folder" in this app = a task with children via `_tasks.folderId` (purely organizational,
  "carries no execution semantics"). There is NO `kind`/`isFolder` column.
- **Launching an agent on a regular parent task (one with subtasks) is a legitimate, supported
  flow** (the `LaunchAgentAction` row action renders on every row). So the guard CANNOT be
  "has children" — it must be id-based, targeting only the designated system meta tasks.
- All 5 meta tasks are created at boot via `ensureMetaTask(id, title)` in each owning plugin's
  `onReady`. Each id constant is owned by its plugin (mostly server-only barrels).
- The meta folders ARE rendered as visible, launchable rows in the Tasks tree + Recent tabs.
- Attempt creation chokepoint for user/programmatic callers: `createConversation` →
  `createAttempt`. (`adoptOrphanConversation` is a recovery path that creates its own fresh
  task or adopts an existing attempt — out of scope.)
- Server contributions use `defineServerContribution<P>(name)`; consumers read
  `token.getContributions()` (populated by the boot loader before any request).
- Client-facing 4xx: `throw new HttpError(status, msg)` inside an `implement()` handler.

## Design

**Invariant:** designated system container tasks must never own attempts. Id-based.

**Single source of truth (collection-consumer separation):** new plugin
`plugins/tasks/plugins/container-tasks/` owns a `ContainerTask` server-contribution registry.
Each meta-owning plugin contributes its own id. Consumers use only the generic read API.

### New plugin `plugins/tasks/plugins/container-tasks/`

- `core/` — `listContainerTaskIds` endpoint contract (`GET /api/tasks/container-ids` → `{ ids: string[] }`).
- `server/` — `ContainerTask = defineServerContribution<{ id: string }>("containerTask")`;
  `isContainerTask(id)`, `assertNotContainerTask(id)` (throws `HttpError(400)`); endpoint impl.
- `web/` — `useContainerTaskIds()` + `useIsContainerTask(id)` reading the endpoint (cached).

### Contributors (add `ContainerTask({ id })` to `contributions`)

- `plugins/tasks/server` → `CONVERSATIONS_META_TASK_ID`
- `plugins/conversations/server` → `SYSTEM_META_TASK_ID`
- `plugins/conversations/plugins/agents/server` → `AGENTS_META_TASK_ID`
- `plugins/improve/server` → `IMPROVEMENTS_META_TASK_ID`
- `plugins/reports/server` → `REPORTS_META_TASK_ID`

### Enforcement

1. **Server (authoritative):** in `createConversation` lifecycle, when `opts.taskId` is
   explicitly provided, call `assertNotContainerTask(opts.taskId)` before `createAttempt`.
   Rejects with a clear 400 — fail loudly for programmatic misuse.
2. **Web (UX):** every Launch affordance that targets a task's own id
   (`LaunchAgentAction`, task-description Launch, task-header Launch) hides itself when the
   row is a container task. Users never hit the error.

**Reject (not silent redirect):** failing loudly surfaces caller bugs; web gating keeps the
happy path clean. Launching a folder isn't a meaningful action (its prompt would be empty).

## Out of scope / follow-ups

- `adoptOrphanConversation` recovery path is not guarded (creates its own fresh task).
- No existence check is added for non-container unknown `taskId` (separate pre-existing gap:
  bogus id → FK error 500; could become a 400). File as follow-up if desired.
