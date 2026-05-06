# Conversations & Tasks Lifecycle — Previous State

> Snapshot of the full lifecycle, event graph, and UI surfaces as of 2026-05-06.
> Reference doc for the redesign — this describes the **before** state.

---

## 1. Data Model

### Physical Tables (`plugins/tasks-core/server/internal/tables.ts`)

| Table | Key columns |
|---|---|
| `tasks` | `id` (`task-<ms>-<6char>`), `parentId` (self-ref FK CASCADE), `title`, `description`, `author`, `droppedAt`, `heldAt`, `expanded`, `rank` (fractional index), `createdAt`, `updatedAt` |
| `attempts` | `id` (`att-<epoch_s>-<4char>`), `taskId` (FK→tasks CASCADE), `worktreePath` |
| `conversations` | `id` (`conv-<epoch_s>-<4char>`), `attemptId` (FK→attempts CASCADE), `title`, `status` (text, default `"starting"`), `runtime` (default `"tmux"`), `model`, `kind` (`"user"`/`"agent"`/`"system"`), `claudeSessionId`, `spawnedBy`, `createdAt`, `updatedAt`, `endedAt` |
| `pushes` | `id`, `attemptId` (FK→attempts CASCADE), `conversationId` (soft, no FK), `sha`, `pushId`, `message`, `createdAt` |
| `task_dependencies` | `taskId`, `dependsOnTaskId` (both FK→tasks CASCADE, composite PK) |

### Entity Extension Side-Tables

| Table | Owner plugin | Columns |
|---|---|---|
| `conversations_ext_queue` | `conversations-view/queue` | `parentId` (FK→conversations), `rank` (text) |
| `conversations_ext_progress` | `conversation-progress` | `parentId`, `phase`, `source` |
| `conversations_ext_turn_summary` | `turn-summary` | `parentId`, `summary`, `caveats`, `actions`, `messageId` |
| `conversation_categories` | `conversation-category` | `parentId`, `category`, `source` (`"haiku"`/`"manual"`), `classifiedAt` |
| `tasks_ext_auto_start` | `tasks/auto-start` | `parentId` (logical FK→tasks), `autoStartAt`, `autoStartModel` |
| `_conversationSummaries` | `conversations/summary` | append-only history: `model`, `turnCountAtGeneration`, `phase`, `phaseDetail`, `flags`, `nextAction`, `notes` |

### Derived Views (SQL, not stored)

All status fields are **computed in views**, never written directly.

#### `conversations_v`

Joins `_conversations` + `_attempts`. Adds `worktree_path`, `task_id`, `active` (boolean: `status <> 'gone'`).

#### `attempts_v` — AttemptStatus

| Status | Condition |
|---|---|
| `pending` | No conversation rows exist |
| `in_progress` | ≥1 live conversation (status ≠ `gone`), no push |
| `pushed` | ≥1 live conversation + ≥1 push |
| `completed` | ≥1 push, no live conversations |
| `abandoned` | Has conversations but none live, no push |

`active: boolean` = `(no conversations) OR (has a live conversation)`

#### `tasks_v` — TaskStatus (priority order, first match wins)

| Status | Condition |
|---|---|
| `dropped` | `droppedAt IS NOT NULL` |
| `held` | `heldAt IS NOT NULL` |
| `done` | ≥1 attempt with status = `completed` |
| `blocked` | ≥1 dependency that is not dropped and has no completed attempt |
| `need_action` | ≥1 active attempt AND ≥1 conversation with status = `waiting` |
| `in_progress` | ≥1 active attempt |
| `attempted` | ≥1 attempt (but none active) |
| `new` | No attempts |

`active: boolean` = `droppedAt IS NULL AND heldAt IS NULL AND NOT has_completed AND NOT has_blocking_dep AND has_active`

---

## 2. Conversation Lifecycle

### ConversationStatus Values

```
"starting"  — process spawning / worktree warming
"working"   — Claude is actively computing
"waiting"   — Claude paused, waiting for user input / permission prompt
"gone"      — process is dead (any cause)
```

`isActiveStatus(status)` returns `true` for anything not `"gone"`.

### Status Transition Diagram

```
  createConversation()
         │
         ▼
    "starting"
         │
    poller (1s) reads tmux pane title
       ╱           ╲
  spinner glyph    ✳ glyph
       ▼              ▼
  "working"  ◄──►  "waiting"
       │
  tmux dies / pane dead / not in list > 30s grace
       ▼
     "gone"
       │
  resumeConversation()  →  "starting" (cycle repeats)
```

The **poller** (`conversations/server/internal/poller.ts`) runs every **1 second**, reconciles tmux session state against DB rows, and drives all transitions. It reads the tmux pane title: spinner glyphs → `working`, `✳` → `waiting`, dead pane → `gone`.

### Conversation Creation

#### Entry points (all funnel through `createConversation()` in `conversations/server/internal/lifecycle.ts`)

1. **`POST /api/conversations`** — UI launch buttons, fork buttons, launch prompts
2. **`maybeLaunchTaskJob`** — auto-start fires when task dependencies unblock
3. **Internal / system** — e.g. conversation-summary spawns a system Sonnet conversation

#### `createConversation()` flow

1. Resolve `runtimeId` (default `"tmux"`), `model` (default from registry), `spawnedBy`
2. If `forkFromConversationId`: inherit `attemptId` and `resumeSessionId` from source conversation
3. If no `attemptId` provided:
   - Create task via `createTask()` (parent = `CONVERSATIONS_META_TASK_ID` or `SYSTEM_META_TASK_ID`) if no `taskId`
   - Generate `att-<epoch>-<rand>` attempt ID
   - `worktreePathFor(attemptId)` → `setupWorktree(attemptId, worktreePath)`
   - `forkDatabase(attemptId)` in background (non-blocking)
   - `createAttempt({ id, taskId, worktreePath })`
4. Resolve `![](/api/attachments/<id>)` references in prompt → `@<disk-path>`
5. `insertConversation({ id: conv-<epoch>-<rand>, attemptId, runtime, model, spawnedBy, kind })` — row inserted with `status = "starting"`
6. `tmuxRuntime.create(conversationId, worktreePath, { prompt, model, resumeSessionId, forkSession })` — spawns tmux session with `claude --model <flag> [--resume <id>] [--fork-session] -- "$prompt"`
7. If runtime.create throws → immediately `updateConversation(id, { status: "gone", endedAt })` and re-throw
8. Emit **`conversation.created`** event
9. Return conversation row

### Conversation Operations

| Operation | Endpoint | Server action |
|---|---|---|
| **Create** | `POST /api/conversations` | Full `createConversation()` flow |
| **Send turn** | `POST /api/conversations/:id/turn` | `runtime.send()` (tmux paste-buffer + Enter), emits `conversation.userTurnSent` |
| **Stop** | `POST /api/conversations/:id/stop` | `runtime.interrupt()` (sends Escape), rewinds last user turn |
| **Resume** | `POST /api/conversations/:id/resume` | Validates `gone` + `claudeSessionId` exists; kills stale tmux, re-creates with `--resume <claudeSessionId>` |
| **Close** | `POST /api/conversations/:id/close` | `runtime.delete()` (kill tmux); poller marks `gone` |
| **Exit** | `POST /api/conversations/:id/exit` | Same as close |
| **Hold & Exit** | `POST /api/conversations/:id/hold-and-exit` | Sets `task.heldAt`, kills tmux |
| **Drop & Exit** | `POST /api/conversations/:id/drop-and-exit` | Sets `task.droppedAt` (or marks done if pushed), kills tmux |
| **Push & Exit** | `POST /api/conversations/:id/push-and-exit` | Sends "push" message to Claude, monitors for flag/completion via background job |
| **Delete** | `DELETE /api/conversations?name=:id` | `runtime.delete()` + removes DB row entirely |

### Turn Detection

The **turn emitter** (`conversations/server/internal/turn-emitter.ts`):
- Polls `listConversationsForInfra()` every **5 seconds** to maintain subscriptions
- For each active conversation: subscribes via `watchTranscript()` (transcript-watcher plugin, uses `@parcel/watcher`)
- On each JSONL change: reads file, filters for `kind === "assistant-text"` events with `stopReason === "end_turn"` and a `messageId`
- Deduplicates by `messageId`, emits **`conversation.turn-completed`** event

### tmux Runtime (`conversations/plugins/runtime-tmux/server/internal/tmux-runtime.ts`)

| Method | What it does |
|---|---|
| `create(convId, worktreePath, opts)` | `tmux new-session -d -s <convId> -c <worktreePath> -e SINGULARITY_CONVERSATION_ID=<id> zsh -l -c <claudeCmd>` |
| `list()` | `tmux list-panes -a`, parses pane title glyphs for working/waiting state |
| `send(convId, text)` | Loads text into tmux buffer, pastes with bracketed-paste markers, sends Enter |
| `interrupt(convId)` | Exits copy mode, sends Escape |
| `delete(convId)` | `tmux kill-session -t <convId>` |

---

## 3. Task Lifecycle

### Task Creation

#### Entry points (all funnel through `createTask()` in `tasks-core/server/internal/mutations/tasks.ts`)

1. **`POST /api/tasks`** (`tasks/server/internal/handle-create.ts`) — single task from sidebar, inline `<task>` card
2. **`POST /api/tasks/chain`** (`tasks/server/internal/handle-create-chain.ts`) — dependency chain from TaskDraftPopover
3. **MCP `add_task` tool** (`tasks/server/internal/mcp-tools.ts`) — agent-created tasks
4. **`createConversation()`** (`conversations/server/internal/lifecycle.ts`) — when no `taskId` provided

#### `createTask()` flow

1. Generate id `task-<ms>-<6char>`
2. Compute rank via `findNextRankUnder(parentId)`
3. `db.insert(_tasks).values(...)`
4. If `parentId`: set parent's `expanded = true`
5. `tasksResource.notify()`
6. Re-read from `tasks_v` view
7. `emitStatusChangeIfChanged(id, null)` → first-ever status (typically `"new"`)

#### Bypasses (not user-facing)

- **`ensureMetaTask()`** — idempotent sentinel provisioning, `onConflictDoNothing`, no status emit
- **`adoptOrphanConversation()`** — orphan recovery in `cross-table.ts`, inserts `_tasks` + `_attempts` + `_conversations` in a single transaction, skips `emitStatusChangeIfChanged`

### Task Updates

**`updateTask(id, patch)`** — patch fields: `title`, `description`, `drop` (bool), `hold` (bool), `expanded`, `parentId`, `rank`.

- `drop: true` → sets `droppedAt`, clears `heldAt`
- `hold: true` → sets `heldAt`, clears `droppedAt`
- Snapshots status before write, calls `emitStatusChangeIfChanged(id, before)` after

**Endpoint:** `PATCH /api/tasks/:id`

### Implicit Status Changes

Task status is never written directly — it's recomputed from the view. Any mutation to conversations, attempts, pushes, or task_dependencies can flip the status. All mutations call `emitStatusChangeIfChanged()` after the write:

- `insertConversation()` / `updateConversation()` / `markConversationClosed()` / `deleteConversationRow()`
- `createAttempt()` / `deleteAttempt()`
- `insertPush()`
- `addTaskDependency()` / `removeTaskDependency()`

### Auto-Start

**`armTaskAutoStart()`** (`tasks/server/internal/arm-auto-start.ts`):
1. `setTaskAutoStart(taskId, { model })` — upserts `tasks_ext_auto_start` row
2. If `hasBlockingDep(taskId)` → install oneShot triggers: fire `maybeLaunchTaskJob` when each dep reaches `done` or `dropped`
3. If no blocking deps → `maybeLaunchTaskJob.enqueue({ taskId })` immediately

**`maybeLaunchTaskJob`** (`conversations/server/internal/auto-start-jobs.ts`):
1. Guard: only runs on main worktree
2. Guard: task still exists, auto-start ext row still exists, no blocking deps remaining
3. `claimAutoStart(taskId)` — atomic CAS DELETE of ext row (prevents double-launch)
4. Guard: task has no existing attempts (manual start didn't race)
5. `createConversation({ taskId, model, prompt: buildTaskPrompt(task), spawnedBy: "auto-start" })`

---

## 4. Events & Subscribers

### Event Definitions (all via `defineTriggerEvent`)

| Event | Payload | Emitted by |
|---|---|---|
| `conversation.created` | `conversationId, taskId, model, spawnedBy, createdAt, prompt?, kind` | `createConversation()` |
| `conversation.turn-completed` | `conversationId, stopReason: "end_turn", text, messageId` | turn-emitter (JSONL watcher) |
| `conversation.userTurnSent` | `conversationId, taskId, text` | `handlePostTurn()` |
| `tasks.statusChanged` | `taskId, parentId, status, previousStatus` | `emitStatusChangeIfChanged()` |
| `pushes.landed` | `pushId, sha, attemptId, conversationId` | `insertPush()` |

### Subscriber Graph (Event → Job → Effect)

| Event | Subscriber job | Plugin | LLM | Effect |
|---|---|---|---|---|
| `conversation.created` | `titleOnConversationCreatedJob` | task-title | Haiku | Upgrade task title from prompt (if "Untitled") |
| `conversation.created` | `seedRankJob` | queue | — | Seed queue rank at position 2 |
| `conversation.created` | `applyGroupJob` | improve | — | Apply pending improvement groups |
| `conversation.turn-completed` | `classifyConversationJob` | conversation-category | Haiku | Classify category (once per conv, unless forced) |
| `conversation.turn-completed` | `classifyProgressJob` | conversation-progress | — | Detect phase via git diff heuristics |
| `conversation.turn-completed` | `generateTurnSummaryJob` | turn-summary | Haiku | One-line summary + caveats + actions |
| `conversation.turn-completed` | `seedRankJob` | queue | — | Re-seed rank to position 2 (Anki cycling) |
| `conversation.userTurnSent` | `titleOnUserTurnSentJob` | task-title | Haiku | Upgrade task title from user text (if "Untitled") |
| `tasks.statusChanged` (→done/dropped) | `maybeLaunchTaskJob` | auto-start | — | Launch queued task once deps unblock |
| `pushes.landed` | `markProgressPushedJob` | conversation-progress | — | Mark all attempt conversations as "pushed" |

---

## 5. Title Generation

### Paths

1. **On task creation via HTTP** (`handle-create.ts`, `handle-create-chain.ts`):
   - Immediate: `synthesiseTitleFallback(description)` — first line, truncated to 80 chars
   - Async: `scheduleTaskTitleUpdate(id, description, fallbackTitle)` → Haiku → CAS write if DB title still equals fallback

2. **On conversation creation** (via `conversation.created` event → `titleOnConversationCreatedJob`):
   - `scheduleTaskTitleUpgrade(taskId, prompt)` → Haiku → CAS write if title still in `["Untitled", "Untitled conversation"]`
   - Also: `updateConversationsTitleForTask(taskId, generated)` — sets conversation `title` where it's NULL

3. **On user turn sent** (via `conversation.userTurnSent` event → `titleOnUserTurnSentJob`):
   - Same `scheduleTaskTitleUpgrade()` path

4. **MCP `add_task`** — passes explicit `title` directly to `createTask()`, no Haiku upgrade

### CAS Guard

`updateTaskTitle(taskId, generated, uninformativeTitles)` only writes if the DB title is still in the uninformative list. Prevents clobbering user edits that arrived during the Haiku round-trip.

---

## 6. Auto-Classification Pipeline

### Conversation Category (`conversation-category`)

- Triggered by: `conversation.turn-completed`
- Runs **once** per conversation (skips if already classified by Haiku or manual override)
- Reads first 6 transcript turns, asks Haiku for a single category label
- Default categories: `["General question", "Small feature", "Load bearing infra", "Bug", "Other"]`
- Storage: `conversation_categories` entity extension
- Manual override: `POST /api/conversation-category/:id` (sets `source: "manual"`)
- Re-classify: `POST /api/conversation-category/:id/classify` (enqueues with `force: true`)

### Conversation Progress (`conversation-progress`)

- Triggered by: `conversation.turn-completed` + `pushes.landed`
- **No LLM** — pure git heuristics on `git diff --name-only <merge-base>`
- Phase detection: no files → `research`, only `research/**` → `design`, any other file → `implementation`
- Monotonically increasing (never regresses)
- Push event → marks all attempt conversations as `pushed` (terminal phase)
- Phase order: `research → design → implementation → pushed`

### Turn Summary (`turn-summary`)

- Triggered by: `conversation.turn-completed`
- Runs on **every** assistant turn (deduped by messageId)
- Reads last user turn + assistant turn, asks Haiku for `## Summary`, `## Caveats`, `## Actions`
- Each clipped to 12,000 chars
- Storage: `conversations_ext_turn_summary` entity extension (replaced on every turn)

### Conversation Summary (`conversations/summary`) — On-Demand Only

- User-triggered "Summarise" toolbar button
- Spawns a full **Sonnet** system conversation
- Builds XML context file with task + transcript, writes to `/tmp/`
- Sonnet reads context with Read tool, calls `submit_conversation_summary` MCP tool
- Phase enum: `clarification_needed / design_review / implementation_review / investigating / executing / other`
- Storage: `_conversationSummaries` (append-only history)
- Spawned conversation auto-deleted after 5 minutes

---

## 7. Live-State Push Chain (Server → UI)

```
insertConversation / updateConversation / poller  →  recentConversationsResource ("conversations")
insertPush                                        →  pushesResource ("pushes")
                                                       ↓
                                     attemptsResource ("attempts") — depends on both
                                                       ↓
                                     tasksResource ("tasks") — depends on attempts
```

Also: `tasksAutoStartResource ("tasks-auto-start")` — notified by `setTaskAutoStart` / `claimAutoStart`.

All resources use `mode: "push"` — server notifies clients over the leader-elected WebSocket channel.

---

## 8. UI Surfaces

### Conversation Creation Surfaces

| Surface | Plugin | Mechanism |
|---|---|---|
| Sidebar top launch strip | `conversations-view` | `POST /api/conversations { model }` |
| Task detail "Launch" buttons | `task-header` | `POST /api/conversations { model, taskId, prompt }` |
| Task row icon buttons | `task-list` | Same |
| Fork buttons (prompt bar) | `fork-conversation` | `POST /api/conversations { model, attemptId, prompt? }` |
| Fork session (JSONL row action) | `fork-session` | `POST /api/conversations { model, forkFromConversationId }` |
| Launch prompts dropdown | `launch-prompts` | `POST /api/conversations { model, prompt, attemptId }` |
| Inline `<task>` card "Launch" | `active-data/task` | `POST /api/tasks` then `POST /api/conversations` |
| TaskDraftPopover chain submit | `task-draft-form` | `POST /api/tasks/chain` (with `launch` per card → auto-start) |
| Auto-start (event-driven) | `auto-start` | `maybeLaunchTaskJob` → `createConversation()` |

### Conversation Management Surfaces

| Surface | Plugin | Actions |
|---|---|---|
| Prompt bar: Push & Exit | `push-and-exit` | Multi-mode: go / push-and-exit / exit / drop-and-exit |
| Prompt bar: Exit | `exit` | Close conversation |
| Prompt bar: Hold & Exit | `hold-and-exit` | Hold task + close conversation |
| Prompt bar: Drop & Exit | `drop-and-exit` | Drop task + close conversation (or "Complete & Exit" if pushed) |
| Prompt bar: Resume | `resume` | Resume gone conversation via `--resume` |
| Prompt bar: Blocked By | `blocked-by` | Add/remove task dependencies |
| Prompt bar: Fork buttons | `fork-conversation` | Create new conversation in same worktree |
| Prompt bar: Launch prompts | `launch-prompts` | Pre-configured prompts in same worktree |
| Prompt input | `prompt-input` | Send turn (Enter), stop (red button while working) |
| Quick prompt chips | `quick-prompts` | Send preset turn when waiting |
| Sidebar row × button | `conversations-view` | Close conversation |
| Queue view | `queue` | Reorder, promote, demote, step-down |
| Grouped view | `grouped` | Group/ungroup, rename, reorder |

### Task Management Surfaces

| Surface | Plugin | Actions |
|---|---|---|
| Sidebar task tree | `task-list` | Create inline, rename, move (DnD), expand/collapse, delete, launch agent |
| Task detail header | `task-header` | Edit title, hold/drop, auto-start select, launch buttons |
| Task detail description | `task-description` | Edit markdown description |
| Task detail events | `task-events` | View pushes, attempts, conversations |
| Task detail dependencies | `task-dependencies` | Add/remove dependency chips |
| Task detail attachments | `task-attachments` | View images/files |
| Tasks panel (conversation side-pane) | `tasks-panel` | Same as task detail, scoped to conversation's task tree |
| Inline `<task>` card | `active-data/task` | Create task + optionally launch |
| New child task popover | `new-child-task` | Create dependency chain under current task |
| Task graph band | `task-graph` | Visualize dependency DAG above task detail |

### Conversation View Surfaces

| Surface | Plugin | What it shows |
|---|---|---|
| JSONL viewer (main content) | `jsonl-viewer` | Streamed Claude session log with per-event-type renderers |
| Action bar (header) | `action-bar` | Attempt switch, new child task, etc. |
| Model chip (toolbar) | `model` | Colored model badge |
| Status badge (toolbar) | `status` | Conversation status |
| Commits chip (toolbar) | `commits-graph` | Commits ahead/behind main |
| Category chip (toolbar) | `conversation-category` | Auto/manual category label |
| Progress bar (toolbar) | `conversation-progress` | 4-step research→plan→impl→pushed |
| Turn summary card (above prompt) | `turn-summary` | Last turn summary + caveats + actions |
| Side conversation pane | `side-conversation` | Second conversation alongside host |
| Side task pane | `side-task` | Task detail alongside host |
| Terminal pane | `terminal-pane` | tmux session attachment |
| Code: edited files | `code` | Tracked edited files in worktree |
| Code: docs button | `docs-button` | Opens markdown docs sidebar |
| Code: review | `review` | Full-screen file-by-file review |
| Code: file pane | `file-pane` | Per-file preview (diff/image/markdown/raw tabs) |
| Open app button | `open-app` | Opens `http://<id>.localhost:9000/` |
| VSCode button | `vscode` | Opens worktree in VSCode |

### Attempt View

| Surface | Plugin | What it shows |
|---|---|---|
| Attempt switch button | `attempt-view` | Toggle between standalone and split attempt view |
| Attempt pane (left column) | `attempt-view` | List of all conversations in the attempt |
| Attempt conversation (right column) | `attempt-view` | Full conversation view for selected conversation |

### Active Data Inline Widgets (in transcript text)

| Pattern/Tag | Plugin | Renders as |
|---|---|---|
| `att-<id>` (bare text) | `active-data/attempt` | Clickable chip → opens attempt pane |
| `conv-<id>` (bare text) | `active-data/conv` | Clickable chip → opens side conversation |
| `task-<id>` (bare text) | `active-data/task-link` | Clickable chip → opens task detail |
| `<task>prompt</task>` (block tag) | `active-data/task` | Editable card with Create + Launch |

---

## 9. Server Endpoints Summary

### Conversations

| Endpoint | Triggered by |
|---|---|
| `POST /api/conversations` | LaunchButtons (all surfaces), LaunchPromptsButton, auto-start |
| `GET /api/conversations/gone` | GroupedView, HistoryView (pagination) |
| `POST /api/conversations/:id/turn` | PromptInput send, QuickPromptChips, PushAndExit "Go" mode |
| `POST /api/conversations/:id/stop` | PromptInput stop button |
| `POST /api/conversations/:id/close` | Sidebar × button, PushAndExit cleanup |
| `POST /api/conversations/:id/exit` | ExitButton, PushAndExit exit mode |
| `POST /api/conversations/:id/resume` | ResumeButton |
| `POST /api/conversations/:id/push-and-exit` | PushAndExitButton push mode |
| `DELETE /api/conversations/:id/push-and-exit` | PushAndExitButton job cleanup |
| `POST /api/conversations/:id/hold-and-exit` | HoldAndExitButton |
| `POST /api/conversations/:id/drop-and-exit` | DropAndExitButton, PushAndExit drop mode |
| `DELETE /api/conversations?name=:id` | Full delete (DB row removal) |

### Tasks

| Endpoint | Triggered by |
|---|---|
| `POST /api/tasks` | Sidebar inline add, `<task>` card Create |
| `POST /api/tasks/chain` | TaskDraftPopover (Improve, new-child-task) |
| `PATCH /api/tasks/:id` | Rename, DnD move, expand, hold/drop, title/description edit |
| `DELETE /api/tasks/:id` | DeleteTaskAction |
| `POST /api/tasks/:id/auto-start` | TaskHeader auto-start Select |
| `DELETE /api/tasks/:id/auto-start` | TaskHeader clear, QueuedChip cancel |
| `POST /api/tasks/:id/dependencies` | BlockedByButton add |
| `DELETE /api/tasks/:id/dependencies/:depId` | BlockedByButton remove |

### Queue

| Endpoint | Triggered by |
|---|---|
| `POST /api/conversations-queue/reorder` | QueueView DnD |
| `POST /api/conversations-queue/promote` | QueueRow "Move to top" |
| `POST /api/conversations-queue/step-down` | QueueRow "Move down N" |
| `POST /api/conversations-queue/demote` | QueueRow "Move to bottom" |
| `POST /api/conversations-queue/rerank` | BlockedByButton add/remove |

### Groups

| Endpoint | Triggered by |
|---|---|
| `POST /api/conversation-groups` | GroupedView DnD (create group) |
| `PATCH /api/conversation-groups/:id` | Rename, expand, rank reorder |
| `DELETE /api/conversation-groups/:id` | Group delete |
| `POST /api/conversation-groups/:id/members` | DnD add to group |
| `DELETE /api/conversation-groups/members/:convId` | Remove from group |

### Classification / Summary

| Endpoint | Triggered by |
|---|---|
| `POST /api/conversation-category/:id` | Manual category override |
| `DELETE /api/conversation-category/:id` | Clear category |
| `POST /api/conversation-category/:id/classify` | Re-classify button (force) |
| `POST /api/conversation-summary/:id/generate` | Summarise toolbar button |
