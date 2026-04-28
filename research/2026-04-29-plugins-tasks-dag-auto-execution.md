# Tasks DAG: dependency-based auto-execution + graph view

## Context

A planning agent currently has no clean way to lay out a multi-step pipeline that the system runs hands-off. The auto-start engine only knows about parent → child ("create-and-queue"), so chains are limited to one hop and the parent/child tree has to encode execution order, conflating containment with sequencing.

We want a planning agent to:

1. While running, emit a tree of follow-up tasks linked by **dependencies** (not parent/child).
2. Have those tasks stay blocked until the planner is reviewed and the user marks the planner done.
3. Once unblocked, auto-cascade through the dep DAG until everything terminal.
4. Let the user inspect/monitor the live DAG visually, regardless of which task they happen to open.

This plan switches the auto-start trigger from `parent done` to `all deps done`, gives `add_task` a `"current"` sentinel so a planning agent can express "this task depends on me" without knowing its own id, and adds a react-flow graph view on top of the task-detail pane that all tasks in the same DAG share.

Out of scope (separate followups): roll-up status on parent rows (`task-1777413024948-dz44lu`), intra-task agent/conversation DAG, yak-shaving integration.

## Decisions (already settled)

- **DAG = `task.dependencies` only.** Parent/child is irrelevant to execution after this work. The `task_dependencies` table + `dependencies: string[]` column on the `tasks` view already exist; no schema change.
- **Graph scope per task = transitive closure** in both directions (deps + dependents). Two tasks in the same DAG render the *same* graph.
- **Dropped dep = unblocked.** Matches the existing `hasBlockingDep` SQL in `plugins/tasks-core/server/internal/schema.ts:99-108` (a dep with `dropped_at IS NOT NULL` is not a blocker). No special "cancel queued task" logic.
- **Held dep = still blocking.** No trigger fires; the queued task waits.
- **`"current"` sentinel** in `add_task.dependencies`, opt-in. No default behavior change.
- **Graph view**: top section of `TaskDetailBody`, conditionally rendered when the task has any deps or dependents. Existing detail content stays below, unchanged.

## Critical files

| Concern | File |
|---|---|
| Auto-start trigger wiring | `plugins/conversations/server/internal/auto-start-jobs.ts` |
| Trigger registration on task create | `plugins/tasks/server/internal/handle-create.ts` |
| MCP `add_task` tool | `plugins/tasks/server/internal/mcp-tools.ts` |
| Tasks-core dep mutations (already exist) | `plugins/tasks-core/server/internal/mutations/tasks.ts` (`addTaskDependency`, `removeTaskDependency`, `taskDependsOn`) |
| Task status view (`hasBlockingDep` already computed) | `plugins/tasks-core/server/internal/schema.ts` |
| `taskStatusChanged` event def | `plugins/tasks-core/server/internal/tables-events.ts` |
| Task pane (where graph slot goes) | `plugins/tasks/web/panes.tsx` (`TaskDetailBody`) |
| Front-end task list / row chrome (reused for node chips) | `plugins/tasks/web/components/tasks-list.tsx` |
| `Tasks.View` slot (alternative mount point if we slot the graph instead of inlining) | `plugins/tasks/web/slots.ts` |

## Phase 1 — dependency-based auto-start (PR 1)

Replace the parent-driven launcher with a dep-driven one.

### Trigger semantics

When a task `T` is queued (`autoStartAt` is set), it auto-launches when **all of `T.dependencies` are non-blocking** — same definition as `hasBlockingDep` in `schema.ts`:

> A dep is non-blocking iff `dep.dropped_at IS NOT NULL` *or* the dep has an attempt with `status='completed'` (i.e. `task.status='done'`).

### Wiring

In `handleCreate` (when a task is created with `autoStart`) and wherever else `setTaskAutoStart` is invoked (e.g. an explicit "queue this task" UI later):

For each dep `Di` of the queued task `T`, install:

```ts
// fires when Di reaches "done"
await triggerByName({
  on: taskStatusChanged.where({ taskId: Di, status: "done" }),
  jobName: "tasks.maybe-launch",
  with: { taskId: T.id },
  oneShot: true,
});
// fires when Di is dropped (also unblocks)
await triggerByName({
  on: taskStatusChanged.where({ taskId: Di, status: "dropped" }),
  jobName: "tasks.maybe-launch",
  with: { taskId: T.id },
  oneShot: true,
});
```

Held deps don't fire — task stays blocked until the user un-holds.

If `T.dependencies` is **empty** at queue time (or all deps already non-blocking), enqueue `tasks.maybe-launch` immediately rather than installing triggers.

### Replacement job: `tasks.maybe-launch`

Replaces the old `tasks.launch-queued-children` (parent-keyed) and `tasks.cancel-queued-children`. Single arg, idempotent.

```ts
export const maybeLaunchTaskJob = defineJob({
  name: "tasks.maybe-launch",
  input: z.object({ taskId: z.string() }).passthrough(),
  run: async ({ taskId }) => {
    const t = await getTask(taskId);
    if (!t || !t.autoStartAt) return;          // already launched / cancelled
    if (await hasBlockingDep(taskId)) return;  // not yet unblocked
    if ((await listAttemptsForTask(taskId)).length > 0) {
      // user manually started it; just clear marker
      await setTaskAutoStart(taskId, null);
      return;
    }
    const model = t.autoStartModel ?? "sonnet";
    try {
      await createConversation({
        taskId,
        model,
        spawnedBy: Bun.env.SINGULARITY_WORKTREE ?? "auto-start",
      });
    } finally {
      await setTaskAutoStart(taskId, null);
    }
  },
});
```

`hasBlockingDep(taskId)` is a new helper in `tasks-core` (read from the `tasks_v` view's `dependencies` array + check each dep's `dropped_at`/`status`). One SQL query.

### Coordinated UI change: `new-child-task`

The "create-and-queue" popover (`plugins/conversations/plugins/conversation-view/plugins/new-child-task/`) currently relies on the parent-trigger path. Update it so it submits both `parentId` *and* `dependencies: [parentId]`. The dep makes the new engine fire when the parent (the conversation's task) reaches `done`. Containment via `parentId` is preserved for the tree list; execution order is now via `dependencies`.

### Removals

- Drop `launchQueuedChildrenJob` and `cancelQueuedChildrenJob` from `plugins/conversations/server/internal/auto-start-jobs.ts`. Replace with `maybeLaunchTaskJob`.
- Drop the parent-status triggers in `handle-create.ts`. Replace with the per-dep loop above.
- `listAutoStartChildren(parentId)` is no longer called by the trigger path. If unused elsewhere, remove from `tasks-core` exports.

### Verification (PR 1)

1. Create root task R. Create child T1 with `dependencies: [R.id]`, `autoStart: { model: "sonnet" }`. Confirm T1 stays in `blocked` status (the SQL view computes this automatically).
2. Mark R `done`. Confirm `tasks.maybe-launch` fires, T1 launches, `autoStartAt` clears.
3. Repeat with R `dropped` instead of `done` — T1 should still launch (dropped = non-blocking).
4. Repeat with R `held` — T1 stays blocked. Un-hold → T1 unblocks but does *not* auto-launch (no transition event); manually mark R done after.
5. Multiple deps: T2 with `dependencies: [R.id, S.id]`. Mark R done — T2 stays blocked. Mark S done — T2 launches.
6. Existing "create-and-queue" button still works end-to-end (sanity for the new-child-task migration).

## Phase 2 — MCP `add_task` "current" sentinel (PR 2)

Single-line semantic add. In `plugins/tasks/server/internal/mcp-tools.ts`, in the `add_task` handler, after the existing dep dedup:

```ts
const conv = await getConversation(conversationId);
const currentTaskId = conv?.taskId;
const depIds = Array.from(new Set(dependencies ?? []))
  .map((d) => (d === "current" ? currentTaskId : d))
  .filter((d): d is string => !!d && d !== "" && d !== parent && d !== task.id);
```

Update the tool's input description so the agent knows about it:

> `dependencies` — Task IDs this task depends on (blocking). Use the literal string `"current"` to depend on the task you (the calling agent) are running in — useful when scheduling follow-up work that should wait until your current conversation finishes.

No new field, no default change. Existing callers unaffected.

### Verification (PR 2)

Agent in conversation C (whose task is T_c) calls `add_task({ title: "follow-up", dependencies: ["current"] })`. Returned `task_id` should appear with `dependencies: [T_c]`. Mark T_c done → follow-up auto-launches if also queued (`autoStart: true` would need to be added separately; this PR doesn't touch the autoStart input shape).

> Note: `autoStart` is **not** currently exposed in the MCP `add_task` schema (see `mcp-tools.ts`). To make end-to-end planning workflows trivial, a follow-up PR should add `autoStart?: { model: "sonnet" | "opus" }` to the input. Calling that out as a near-term addition but leaving it out of this scope to keep PR 2 minimal.

## Phase 3 — DAG graph view (PR 3)

### Closure

Compute the DAG closure **client-side**, off `tasksResource` (already push-pushed):

```ts
function computeDagClosure(rootId: string, allTasks: Task[]): Task[] {
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const reverseDeps = new Map<string, string[]>();
  for (const t of allTasks) {
    for (const d of t.dependencies) {
      const arr = reverseDeps.get(d) ?? [];
      arr.push(t.id);
      reverseDeps.set(d, arr);
    }
  }
  const visited = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const t = byId.get(id);
    if (!t) continue;
    for (const d of t.dependencies) stack.push(d);
    for (const r of reverseDeps.get(id) ?? []) stack.push(r);
  }
  return [...visited].map((id) => byId.get(id)!).filter(Boolean);
}
```

Single-user app, modest task counts — no need for a server-side closure resource. Re-renders automatically when `tasksResource` pushes.

### Component

`plugins/tasks/web/components/task-dag.tsx`:

- Uses `react-flow` (`reactflow`, ~50KB gz) — add to root `package.json`.
- Nodes: small chip per task. Status color from `CONV_STATUS_DOT`-equivalent task status palette (already used by `tasks-list.tsx` rows — extract a `<TaskStatusDot>` primitive if not already shared).
- Edges: directed `dep → dependent`, status-tinted (red if dependent is blocked on this dep, green when dep is non-blocking).
- Layout: `dagre` (peer of react-flow) with rank-direction left-to-right.
- Click node → `navigate(\`/tasks/${id}\`)` so the URL drives selection. The pane's `useResource` already re-renders on the URL change, and the same closure includes the new selected node, so the graph stays the same.
- Selected node = the task whose id matches the URL `:taskId` param, drawn with a ring.

### Mount point

In `plugins/tasks/web/panes.tsx`, `TaskDetailBody`:

```tsx
const closure = computeDagClosure(taskId, allTasks);
const inDag = closure.length > 1;          // task has at least one dep or dependent

const body = (
  <div className="h-full overflow-auto">
    {inDag && (
      <div className="border-b" style={{ height: 240 }}>
        <TaskDag closure={closure} selectedId={taskId} />
      </div>
    )}
    <TaskDetail key={taskId} taskId={taskId} onFileOpen={setFilePeekPath} />
    {/* Tasks.View slot contributions unchanged */}
  </div>
);
```

Height fixed at ~240px for v1 (room for ~3 swimlanes). User can scroll the rest of the body.

### Verification (PR 3)

1. Create a chain R → A → B → C (each `dependencies: [predecessor]`). Open `/tasks/R` — graph shows all four nodes, R selected. Click A — URL becomes `/tasks/A`, same graph, A now ringed.
2. Add a fork: D `dependencies: [A]`, E `dependencies: [B, D]`. Graph layout updates live.
3. Mark A done → A's node colors flip to "done"; B's blocking-edge from A flips to "satisfied". B remains blocked until R also done.
4. Open a task with no deps and no dependents (e.g. an isolated user task) — graph section is hidden.
5. Take a Playwright screenshot at `/tasks/<id>` for a 5-node DAG to confirm visual layout.

## Step ordering / PR boundaries

| PR | Scope | Reviewable independently? |
|---|---|---|
| 1 | Dep-based auto-start engine; new-child-task wiring update; remove old launcher/canceller | Yes — passes existing manual flows |
| 2 | `"current"` sentinel in `add_task` | Yes — additive, no breakage |
| 3 | Graph view in task-detail pane | Yes — UI-only, additive |

PR 1 is the only one with a coordinated change (engine + UI button). PR 2 and PR 3 are isolated.

## Notes on what's *not* changing

- No new DB columns, no migration. `task_dependencies`, `autoStartAt`, `autoStartModel` already exist.
- `addTaskDependency`/`removeTaskDependency` already exposed as exports — `add_task` already uses them.
- `Tasks.View` slot stays as-is. The graph is inlined in `TaskDetailBody` rather than slotted, because it's part of the pane's identity, not an optional contribution from another plugin.
- `taskStatusChanged` event payload is unchanged; only the trigger filters change.

## Open small questions deferred to implementation

- Whether `tasks.maybe-launch` should retry-on-failure (existing launcher catches and clears the marker; preserve that behavior).
- Whether a "drag-to-add-dep" affordance belongs in the v1 graph (probably no — view-only first; agent or task-detail UI does the wiring).
- Sticky `react-flow` viewport between navigations within the same DAG — may need a single mounted instance with selectedId prop swap rather than remount per route. Polish for a follow-up.
