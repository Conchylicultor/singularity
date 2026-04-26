# Yak-shaving tree: building it and the current snapshot

## What this is

A "yak-shaving tree" maps active conversations back to their original goals and shows how each spawned child investigations or prerequisites. It answers: *what was I actually trying to do, and how did I end up here?*

---

## How to build it: data + steps

### Step 1 — Fetch active conversations

```
GET /api/conversations
```

Filter to `active: true`. Each object has:

| Field | Use |
|---|---|
| `id` | conversation ID (needed to fetch turns) |
| `taskId` | links conversation → task |
| `title` | auto-generated title (often a good summary) |
| `status` | `working` / `waiting` |
| `model` | `sonnet` / `opus` |
| `createdAt` | chronological ordering |

Exclude `conv-` entries that belong to the current session (the agent doing the analysis is itself an active conversation).

### Step 2 — Fetch the task tree

```
GET /api/tasks
```

Returns all tasks (not paginated). Each task has:

| Field | Use |
|---|---|
| `id` | task ID |
| `parentId` | parent task ID (null at root) |
| `title` | task title |
| `status` | `new` / `active` / `done` / `dropped` / `held` |
| `createdAt` | ordering |

Build a map `id → task`. For each active conversation's `taskId`, walk up via `parentId` until null to get the full ancestor chain. The root is either a meta-task (`task-meta-conversations`, `task-meta-improvements`, `task-meta-agents`) or the task itself if it has no parent.

Meta-task IDs (stable, created by the system):
- `task-meta-conversations` — manual conversations started by the user
- `task-meta-improvements` — improvement tasks filed via the Improve button
- `task-meta-agents` — agent-spawned tasks

### Step 3 — Fetch the first user turn for each conversation

```
GET /api/conversations/:id/turns
```

Returns `{ turns: [{ at, role, text }] }`. Take the first entry with `role: "user"`. This is the original prompt — the clearest statement of intent before any agent elaboration.

Limit reading to the first turn only. The rest is agent work, not the goal.

### Step 4 — Build the tree

Algorithm:

1. Group conversations by their **root task** (top of ancestor chain, ignoring meta-tasks as roots — go one level deeper).
2. Within each group, sort by `createdAt` ascending to see the causal order.
3. Annotate each node with: title, first-user-turn excerpt (≤ 200 chars), status, and depth from root.
4. Look for patterns:
   - **Prerequisite chains**: A spawns B because B must be done before A can proceed.
   - **Blocker detours**: A reveals a bug/issue → new conversation C to fix it.
   - **Research forks**: A question spawns two parallel investigation conversations.
   - **Scope creep**: A "quick fix" conversation spawns an architectural redesign.

### Notes on accuracy

- `title` is auto-generated from the conversation content, so it's a decent summary but may be imprecise.
- Two conversations can share the same `taskId` — they are parallel attempts on the same task.
- Tasks under `task-meta-improvements` were filed via the Improve button with a screenshot; the first user turn often contains error output or a UI description rather than a goal statement.
- The task `parentId` chain is the most reliable signal for intent hierarchy; conversation titles are secondary.

---

## Current tree — snapshot as of 2026-04-26

### Thread 1: Events system

**Goal**: Add cron-like scheduled triggers to the event system.

```
Design cron trigger mechanism (Apr 23)
  "Should cron be a separate event type or just a tick emitted every N seconds?"
  └─ Evaluate Graphile Worker for event design (Apr 23)          [waiting]
       "Should we switch the design to use Graphile Worker?"
       └─ Implement events adoption with two migrations (Apr 24)  [waiting]
            "Look at the plan in research/2026-04-24-events-adoption-two-migrations.md and implement"
```

Cron is blocked on the events system rewrite, which itself required evaluating whether to adopt Graphile Worker first. The implementation conversation is the current leaf — it was handed a concrete plan but is still waiting.

---

### Thread 2: Stability / crashes

**Goal**: The app and OS keep crashing.

```
Fix PUSH_EXIT_CLEAN not closing conversations (Apr 23)           [waiting]
  "PUSH_EXIT_CLEAN does not always close the conversation"

Investigate Mac crashes — too many files open (Apr 26)           [waiting]
  "My computer keeps crashing with 'too many files open' at the OS level"
  └─ Investigate orphaned Claude CLI processes (Apr 26)           [waiting]
       "Claude CLI processes are still running outside any tmux session — orphans surviving their parent tmux"
```

Side-note: a `fd-monitor` launchd agent sidequest was also created (visible in git log) as a diagnostic tool for the FD exhaustion. That is a separate worktree, not an active conversation.

---

### Thread 3: Sync engine refactor

**Goal**: Eliminate cross-worktree state leakage (auth tokens, secrets, config bleeding across namespaces).

```
Redesign sync engine architecture from scratch (Apr 26)          [waiting, 2 conversations]
  "Look at research/2026-04-26-sync-design-*.md — evaluate the API design"
  ├─ Design central-runtime plugins for gateway-routed state      [working]
  │    "Design central-runtime plugins routed by the gateway to
  │     eliminate cross-worktree leakage"
  └─ Design minimal sync-engine plugin API interface              [waiting]
       "Look at the research docs — design the minimal API surface"
```

Two conversations share the same task ID (`task-1777192597537`). One is exploring the API surface, the other the structural gateway changes. Both are still in design/research phase — no implementation has started.

---

### Thread 4: UI polish

**Goal**: Make the UI consistent and polished.

```
Review ui-mastery sidequest documentation (Apr 23)               [waiting]
  "Let's resume the ui-mastery sidequest — where should we start?"
  ├─ Audit and unify PaneChrome usage across components (Apr 23)  [waiting]
  │    "PaneChrome is not used consistently — should be used everywhere"
  └─ Implement sticky scroll plugin for code views (Apr 23)       [waiting]
       "Can we add sticky scroll (like VSCode) to the code file views?"
```

---

### Thread 5: Improvement sweep

**Goal**: Find and fix user-facing gaps in the app.

```
Assess current project state (Apr 23)                            [waiting]
  "What do you think of the current state of the project?"
  └─ Agent: Find improvement tasks (Apr 23)                       [waiting]
       spawned an agent to survey the codebase for user-facing gaps
       └─ Add fork conversation feature to CLI (Apr 26)           [working]
            "In the conversation view, add a button to fork the current
             conversation as a prompt (reuse draft as initial message)"
```

Note: The "Add mini codebase explorer side pane" (Apr 23) conversation is also in this sweep. The `code-explorer` plugin now appears in `plugins.md`, suggesting it may have been shipped already — but the conversation is still marked active.

---

### Orphan / standalone tasks

These have no clear parent chain linking them to a larger goal:

| Conversation | Original prompt | Status |
|---|---|---|
| Design plugin test strategy (Apr 24) | "Design the test strategy for plugin — locations, folder structure, Check CLI" | waiting |
| Fix orphaned attachments on task delete (Apr 24) | "DELETE /api/tasks/:id doesn't remove attachments — rows remain in the DB" | waiting |
| Design backup with Google Drive (Apr 24) | "Backup should also save in my Google Drive in case my computer gets lost" | waiting |
| Claude Code / mini codebase explorer (Apr 23) | "Add a mini codebase explorer side pane with file tree" | waiting — likely already shipped |

---

## Summary of blockers

| Thread | Blocked by |
|---|---|
| Cron triggers | Events system rewrite (events adoption migration) |
| Events adoption | Nothing — has a concrete plan, just needs to be resumed |
| Sync engine refactor | Still in design phase — no implementation task yet |
| Mac crashes | Orphaned process investigation still open |
| UI polish | No hard blocker — PaneChrome and sticky scroll are independently resumable |
| Fork conversation | Actively working |
