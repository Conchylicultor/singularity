# tasks-core

## The id mints are exported, because the ids are also PARSED

`core/id-mint.ts` owns `newTaskId` / `newAttemptId` / `newConversationId`. They
used to be inline expressions at their two call sites (`createTaskOn`,
`conversations`' `lifecycle.ts`), which was fine right up until something else
started reading the shape back: a bare `task-…` / `att-…` / `conv-…` written in
assistant prose is recognised by an active-data chip and rendered as a clickable
widget, so each chip's `pattern.ts` is a SECOND, independent declaration of a
format only the mint really owns.

That pair drifts silently — the mint keeps minting, the chips just stop
matching — and it has already happened once here (the retired
`block-\d+-[a-z0-9]{4,8}` shape). Exporting the mints is what lets each chip's
`pattern.test.ts` build every fixture from the REAL mint instead of a hand-typed
literal that looks right, so a change to either half fails a test.

KNOWN WART, stated at the mint and not fixed there: `Math.random().toString(36)`
can yield fewer characters than the slice asks for, so a mint can rarely emit a
suffix shorter than the four its chip pattern requires. `newPrototypeId` shows
the fix; applying it changes the bytes of every id the app mints, which is not a
change to make in passing.

## Schema layer

The five-table FK cluster (`tasks` self-ref folder/group, `attempts`,
`task_dependencies` composite junction, `pushes`, `conversations`) is defined
through **`defineEntity`** (`infra/entities`) in `server/internal/tables.ts`.
Each table derives from one **field record** in `core/internal/fields.ts`
(`taskFields` / `attemptFields` / `taskDependencyFields` / `pushFields` /
`conversationFields`) — web-safe, built only from the `fields/*/config`
factories (`textField`, `enumTextField`, `boolField`, `dateField`, `rankField`,
`nullable(...)`). FK / cascade / set-null edges, DB defaults, and indexes live in
the entity `meta`, reproducing the previous raw-drizzle DDL byte-for-byte.

The public wire schemas (`TaskSchema` / `AttemptSchema` / `PushSchema` /
`ConversationSchema`, plus `TaskListItemSchema`) live in
`core/internal/schema.ts` and are **derived from the same field records** via
`fieldsToZodObject(<fields>).extend(...)`: the base table columns come from the
field record; the `.extend()` layers the computed *view* columns the derived
pgViews add (`status`, `active`, `finishedAt`, `dependencies`, `worktreePath`,
`taskId`) plus the transform overrides (`rank` → the `Rank` value object,
`model` → the tolerant `StoredModelSchema`, the enum-branded `status` / `kind`).
These schemas describe the VIEW row shapes the live-state resources publish, so
they are intentionally richer than `entity.schema` (the base table row).

**Tree collapse is not a task field.** There is deliberately no `expanded` column:
expand/collapse is per-`(surface, view-instance, row)` device-local render state
owned by the data-view primitive, so a collapse costs no write and never touches
`updatedAt` (which is a visible, sortable field on the task list). The column, its
patch field, and the two "auto-expand the parent folder when a child is filed"
blocks in `mutations/tasks.ts` were removed together — the reveal they provided is
now the tree primitive's generic add-child / drag-reparent reveal. Do not
reintroduce it; see `plugins/primitives/plugins/data-view/CLAUDE.md` § State split
and `research/2026-07-28-global-tree-collapse-state-as-view-state.md`.

Keeping the field records + public schemas in `core/` is load-bearing: tasks-core
is web-imported, but `defineEntity` is server-only (`resolveFieldStorage` needs
the `fields.storage` contributions, unregistered in the browser). So
`server/internal/schema.ts` is now a thin shim re-exporting
`core/internal/schema.ts`, and **nothing in `core/` imports anything under
`server/`**.

## I5 — `pushes` is a projection of `main`, not the output of a job

> The `pushes` table covers every trailer-bearing commit reachable from
> `refs/heads/main`. It is re-derived in-process on every observed advance of that
> ref (the **push** half) and before any read that could otherwise observe it
> incomplete (the **pull** half). No queue, no job and no boot hook sits between a
> landed commit and the row that records it.

`server/internal/push-ledger/` owns both halves. It is the same shape
`infra/corpus-index` uses for file-derived indexes — a watcher for freshness, a
lazy `ensureFresh` for correctness — over git instead of the filesystem:

- `read-main.ts` — the `git log` over `main`'s trailer-bearing commits. DB-free,
  so `read-main.test.ts` exercises it against throwaway repos.
- `walk-bound.ts` — how far back a walk reaches, as pure policy: the earlier of
  the ledger's high-water mark minus a day (catch-up) and 30 days ago (the window
  in which a deferred commit is re-offered).
- `plan.ts` — the pure attribution: which commits this database can attach to an
  attempt and does not already hold, oldest first, plus the ones it had to defer.
- `reconcile.ts` — the DB-fed orchestration, bounded by a COVERAGE frontier
  (`min(max(pushes.created_at) - 24h, now - 30d)`), so a steady-state run walks a
  month of commits and inserts nothing.
- `attribution.ts` — the in-process generation counter bumped by the one
  conversation-insert funnel, so the freshness signature can see the ledger's
  second input.
- `freshness.ts` — `ensurePushLedgerFresh()`, one `createSignedMemo` signed on
  `main`'s tip AND the attribution generation. A signature hit costs a string
  compare; a failed reconcile leaves the signature unadvanced so the next call
  retries.
- `raw-reads.ts` — the ungated reads the reconcile itself needs, kept in their own
  file so re-entering the gate from inside a reconcile has no spelling.
- `reaction.ts` — the push half, a `defineRefReaction` on `refs/heads/main`.

### A deferral is not a skip

A commit whose conversation is absent here is *deferred*, not skipped: it may
become attributable later, because `adoptOrphanConversation` can synthesise that
conversation row. So the walk bound is a **coverage** frontier, not an insertion
one — bounding on `max(pushes.created_at)` alone meant the ledger's own newest row
moved past a deferred commit and no later walk ever reached it again, losing it
permanently. Do not "optimise" the bound back to the watermark, and do not sign
the freshness memo on `main`'s tip alone: this database's conversation set is the
reconcile's second input, which is why the funnel in `mutations/conversations.ts`
bumps `attribution.ts`. Stated policy, not an accident: a commit unattributable
for more than 30 days is treated as foreign.
Design: `research/2026-08-27-tasks-push-ledger-coverage-frontier.md`.

### Why it stopped being a job

The ledger used to be written by a `tasks.push-ingest` job reacting to the durable
`git.refAdvanced` event. Two structural problems, and the second is the one that
mattered:

1. The job reached the work through two hops of the backend's single four-slot
   graphile pool, shared with DB forks, builds and agent spawns. It was observed
   40+ minutes behind a wedged queue.
2. `refAdvanced.emit()` is `isMain()`-gated and the boot reconcile was a
   `scope: "host"` warm-up, so a **worktree** backend had neither an ingest path
   nor a heal path. Its ledger sat frozen at the moment its DB was forked —
   measured at 77 minutes stale with nothing wedged at all.

That is not cosmetic. `task_blocking_v` blocks on
`NOT EXISTS (attempts WHERE status = 'completed')`, and `attempts_v.status` reaches
`completed` only through `attempt_push_agg.has_push` — so an incomplete ledger keeps
dependent tasks blocked and their armed auto-start from ever firing.

### The two invariants compose

I5 is about **completeness**; I3 (`tasks/attempt-work/CLAUDE.md`) is about
**interpretation**. Even a complete ledger cannot see a commit that carries no
trailer (a `--from-main` push), so a row still only ever *proves* a push happened
and its absence still proves nothing. Anything asking "does this attempt have work
at stake?" reads `getAttemptWork`, not this table.

Full design: `research/2026-08-18-global-push-ledger-git-projection.md`.

## I6 — a derived status may claim only what a fact proves

> Every arm of `attempts_v.status` names a fact the row **proves**. A `pushes` row
> may only ever *promote* an attempt to a landed claim (`pushed` / `completed`);
> its absence may never select a claim of its own. With no landed evidence the
> status reports how the **session** ended — `dormant` (a `gone` conversation, so
> the attempt is resumable) or `closed` (every conversation explicitly closed) —
> and says nothing about what did or did not land.

There is deliberately **no `abandoned`**, and no arm that means "nothing landed".
Removing the value is the enforcement: the conclusion has no spelling, so no future
CASE arm or consumer can reach it. If you are about to add one back, the thing you
want is almost certainly `getAttemptWork` (I3) — `has_push IS NULL` conflates *never
pushed*, *finished with nothing to push*, *landed untrailered* and *the ledger has
not caught up*, and it is `false` for every hibernated (`gone`) attempt too.

Consequence: `attempts_v.status` cannot contradict `standingOf` — its only
landed-claiming arm is backed by the same rows `standingOf` ORs into `"landed"`.
The three compose: **I5** completeness, **I3** interpretation, **I6** the derived
status. `views.test.ts` pins the truth table and the coherence assertion.

Full design: `research/2026-08-20-tasks-attempt-status-positive-evidence.md`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: tasks-core web presence: eagerly registers the boot-critical tasks / attempts / pushes / conversations-* resource descriptors so boot-snapshot can hydrate them before first paint, independent of any (lazy) consumer UI. Schema + repository layer for the tasks/attempts/conversations FK cluster.
- Load-bearing: yes
- Server:
  - Contributes:
    - `resource.declare` "tasks"
    - `resource.declare` "task-detail"
    - `resource.declare` "attempts"
    - `resource.declare` "pushes"
    - `resource.declare` "pushes-by-attempt"
    - `resource.declare` "conversations-active"
    - `resource.declare` "conversations-system"
    - `resource.declare` "conversations-gone"
    - `resource.declare` "conversations-gone-stats"
    - `derived-table` "attempt_conv_agg"
    - `derived-table` "attempt_push_agg"
    - `derived-view` "attempts_v"
    - `derived-view` "conversations_v"
    - `derived-view` "task_blocking_v"
    - `derived-view` "tasks_v"
  - Uses:
    - `database.db`
    - `database/derived-tables.DerivedTable`
    - `database/derived-views.View`
    - `database/sql-projection.nullable`
    - `database/sql-projection.parsed`
    - `infra/attachments.Attachments`
    - `infra/entities.defaultNow`
    - `infra/entities.defineEntity`
    - `infra/events.defineTriggerEvent`
    - `infra/git-read-cache.createSignedMemo`
    - `infra/git-watcher.defineRefReaction`
    - `infra/git-watcher.lastKnownMainSha`
    - `infra/host-read-pool.withHeavyReadSlot`
    - `infra/query-resource.compileEdges`
    - `infra/query-resource.queryResource`
    - `infra/query-resource.rel`
    - `infra/worktree.ensureMainWorktreeRoot`
    - `infra/worktree.isCanonicalWorktreePath`
    - `primitives/commit-list.runGit`
    - `primitives/rank.nextRankUnder`
    - `primitives/rank.RankExecutor`
    - `primitives/rank.withRank`
  - DB schema:
    - `plugins/tasks/plugins/tasks-core/server/internal/mutations/cross-table.ts`
    - `plugins/tasks/plugins/tasks-core/server/internal/rollup-table.ts`
    - `plugins/tasks/plugins/tasks-core/server/internal/schema-attachments.ts`
    - `plugins/tasks/plugins/tasks-core/server/internal/schema.ts`
    - `plugins/tasks/plugins/tasks-core/server/internal/tables-events.ts`
    - `plugins/tasks/plugins/tasks-core/server/internal/tables.ts`
    - `plugins/tasks/plugins/tasks-core/server/internal/views.ts`
  - Exports (types):
    - `AdoptOrphanInput`
    - `Attempt`
    - `AttemptStatus`
    - `AttemptWithConversations`
    - `Conversation`
    - `ConversationKind`
    - `ConversationStatusChangedPayload`
    - `ConversationSummary`
    - `CreateAttemptInput`
    - `CreateTaskInput`
    - `DbExecutor`
    - `InsertConversationInput`
    - `InsertPushInput`
    - `Push`
    - `PushLandedPayload`
    - `Task`
    - `TaskListItem`
    - `TaskStatus`
    - `TaskStatusChangedPayload`
    - `UpdateConversationPatch`
    - `UpdateTaskPatch`
  - Exports (values):
    - `_attempts`
    - `_conversations`
    - `_conversationStatusChangedTriggers`
    - `_pushLandedTriggers`
    - `_tasks`
    - `_taskStatusChangedTriggers`
    - `addTaskDependency`
    - `adoptOrphanConversation`
    - `AttemptSchema`
    - `attemptsResource`
    - `AttemptStatusSchema`
    - `clusterLabelOf`
    - `conversationAttachments`
    - `conversationCascadeSignatures`
    - `ConversationKindSchema`
    - `conversationsActiveResource`
    - `ConversationSchema`
    - `conversationsGoneResource`
    - `conversationsGoneStatsResource`
    - `conversationsSystemResource`
    - `conversationStatusChanged`
    - `conversationsView`
    - `createAttempt`
    - `createTask`
    - `deleteAttempt`
    - `deleteConversationRow`
    - `dropTaskIfNoActiveSibling`
    - `dropTaskTree`
    - `ensurePushLedgerFresh`
    - `findNextRankInFolder`
    - `getAttempt`
    - `getConversation`
    - `getConversationClaudeSessionId`
    - `getConversationRuntime`
    - `getTask`
    - `getTaskDependencyIds`
    - `hasBlockingDep`
    - `insertConversation`
    - `insertConversationOnConflictDoNothing`
    - `insertPush`
    - `isDescendant`
    - `listActiveConversations`
    - `listAttempts`
    - `listAttemptsForTask`
    - `listBlockingDepIds`
    - `listConversationIdsForAttempt`
    - `listConversationsForDisplay`
    - `listConversationsForInfra`
    - `listDependentIds`
    - `listExistingConversationIds`
    - `listGoneConversations`
    - `listHibernationCandidates`
    - `listPushes`
    - `listPushesByPushId`
    - `listPushesForAttempt`
    - `listRetainedConversations`
    - `listTasks`
    - `markConversationClosed`
    - `markConversationGone`
    - `pushesByAttemptResource`
    - `pushesResource`
    - `pushLanded`
    - `PushSchema`
    - `RECENT_GONE_LIMIT`
    - `removeTaskDependency`
    - `runStatusBatchOn`
    - `setConversationHibernated`
    - `taskAttachments`
    - `taskDependsOn`
    - `taskDetailResource`
    - `TaskListItemSchema`
    - `TaskSchema`
    - `tasksResource`
    - `taskStatusChanged`
    - `TaskStatusSchema`
    - `tasksView`
    - `touchConversationViewed`
    - `unionTaskClusters`
    - `updateConversation`
    - `updateConversationsTitleForTask`
    - `updateTask`
    - `updateTaskTitle`
    - `withTaskStatusBatch`
  - Register:
    - `defineTriggerEvent('pushes.landed')`
    - `defineTriggerEvent('tasks.statusChanged')`
    - `defineTriggerEvent('conversation.statusChanged')`
    - `defineRefReaction('tasks.push-ledger (refs/heads/main)')`
  - Resources:
    - `attempts` (keyed)
    - `conversations-active` (keyed)
    - `conversations-gone` (keyed)
    - `conversations-gone-stats` (push)
    - `conversations-system` (keyed)
    - `pushes` (push)
    - `pushes-by-attempt` (keyed)
    - `task-detail` (push)
    - `tasks` (keyed)
- Core:
  - Uses:
    - `conversations/model-provider.DEFAULT_MODEL`
    - `conversations/model-provider.StoredModelSchema`
    - `fields.fieldsToZodObject`
    - `fields.nullable`
    - `fields/bool/config.boolField`
    - `fields/date/config.dateField`
    - `fields/rank/config.rankField`
    - `fields/text/config.enumTextField`
    - `fields/text/config.parsedTextField`
    - `fields/text/config.textField`
    - `infra/query-resource.queryResourceDescriptor`
    - `primitives/live-state.keyedResourceDescriptor`
    - `primitives/live-state.resourceDescriptor`
    - `primitives/pane.defineRoute`
    - `primitives/rank.RankSchema`
  - Exports (types):
    - `Attempt`
    - `AttemptStatus`
    - `AttemptWithConversations`
    - `Conversation`
    - `ConversationKind`
    - `ConversationStatus`
    - `ConversationSummary`
    - `Push`
    - `Task`
    - `TaskListItem`
    - `TaskNode`
    - `TaskStatus`
    - `TrailerCommit`
  - Exports (values):
    - `AttemptSchema`
    - `attemptsResource`
    - `AttemptStatusSchema`
    - `AttemptWithConversationsSchema`
    - `BLOCKED_STATUSES`
    - `buildTaskPrompt`
    - `CONVERSATION_TRAILER_KEY`
    - `ConversationKindSchema`
    - `conversationsActiveResource`
    - `ConversationSchema`
    - `conversationsGoneResource`
    - `conversationsGoneStatsResource`
    - `conversationsSystemResource`
    - `ConversationStatusSchema`
    - `ConversationSummarySchema`
    - `isBlockedStatus`
    - `isSettled`
    - `newAttemptId`
    - `newConversationId`
    - `newTaskId`
    - `parseTrailerLog`
    - `PUSH_TRAILER_KEY`
    - `pushesByAttemptResource`
    - `pushesResource`
    - `PushSchema`
    - `RECENT_GONE_LIMIT`
    - `SETTLED_STATUSES`
    - `taskDetailResource`
    - `taskDetailRoute`
    - `TaskGraph`
    - `TaskListItemSchema`
    - `TaskSchema`
    - `tasksResource`
    - `tasksRootRoute`
    - `TaskStatusSchema`
    - `TRAILER_LOG_FORMAT`
- Cross-plugin:
  - Imported by:
    - `active-data`
    - `backup/sources/transcripts`
    - `code-explorer`
    - `conversations`
    - `conversations/agents`
    - `conversations/all-conversations`
    - `conversations/conversation-category`
    - `conversations/conversation-preprompt`
    - `conversations/conversation-progress`
    - `conversations/conversation-view/allow-monitor`
    - `conversations/conversation-view/code`
    - `conversations/conversation-view/commits-graph`
    - `conversations/conversation-view/drop-and-exit`
    - `conversations/conversation-view/drop-dependents`
    - `conversations/conversation-view/exit`
    - `conversations/conversation-view/hold-and-exit`
    - `conversations/conversation-view/jsonl-viewer/tool-call/ask-user-question`
    - `conversations/conversation-view/notes`
    - `conversations/conversation-view/push-and-exit`
    - `conversations/conversation-view/turn-summary`
    - `conversations/conversations-view/grouped`
    - `conversations/conversations-view/queue`
    - `conversations/hibernation`
    - `conversations/summary`
    - `conversations/transcript-api`
    - `conversations/transcript-retention`
    - `conversations/transcript-watcher`
    - `database/query`
    - `debug/profiling/boot-bench`
    - `debug/profiling/runtime`
    - `debug/queue-health`
    - `debug/session-divergence`
    - `debug/slow-ops/cluster`
    - `debug/worktree-cleanup`
    - `page/annotations/todo/task-link`
    - `page/prompt/link`
    - `plugin-meta/plugin-health`
    - `review/plugin-changes`
    - `stats/cost`
    - `stats/tasks`
    - `tasks`
    - `tasks/attempt-work`
    - `tasks/auto-start`
    - `tasks/reports-investigation`
    - `tasks/task-category`
    - `tasks/task-effort`
    - `tasks/task-preprompt`
    - `tasks/task-title`
  - Extended by:
    - `conversations/conversation-view/notes` (table `conversations_ext_notes`)
    - `conversations/conversation-preprompt` (table `conversations_ext_preprompt`)
    - `conversations/conversation-progress` (table `conversations_ext_progress`)
    - `conversations/conversations-view/queue` (table `conversations_ext_queue`)
    - `conversations/conversation-view/turn-summary` (table `conversations_ext_turn_summary`)
    - `tasks/auto-start` (table `tasks_ext_auto_start`)
    - `tasks/task-category` (table `tasks_ext_category`)
    - `tasks/task-effort` (table `tasks_ext_effort`)
    - `plugin-meta/plugin-health` (table `tasks_ext_health_review`)
    - `tasks/task-preprompt` (table `tasks_ext_preprompt`)
    - `page/prompt/link` (table `tasks_ext_prompt_block`)

<!-- AUTOGENERATED:END -->
