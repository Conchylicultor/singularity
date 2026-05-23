# Pane Entity-Not-Found Detection

## Context

Parameterized panes (those with `:param` in their segment, e.g. `t/:taskId`) silently render with null data when the referenced entity doesn't exist. This surfaces as a blank pane with no error, no crash report, and no user feedback.

Real-world trigger: notifications store `linkTo: "/tasks/t/${taskId}"` as an opaque string. When tasks are deleted or URL structure changes, clicking the link opens blank chrome.

Goal: make entity-not-found detection **mandatory at the type level** for parameterized panes — you cannot compile a `Pane.define` call with `:param` in its segment without providing a `resolve` hook or explicitly opting out with `resolve: false`.

## Design

### Type-level enforcement

Add a `resolve` field to `Pane.define`. Using conditional types on `InferParams<Path>`:
- If segment has **no params** → `resolve` is disallowed (`resolve?: never`)
- If segment has **params** → `resolve` is required: either a hook function or the literal `false`

```ts
type ResolveHook<Params> = (params: Params) => { pending: boolean; found: boolean };

type ResolveField<Path extends string> =
  keyof InferParams<Path> extends never
    ? { resolve?: never }
    : { resolve: ResolveHook<InferParams<Path>> | false };
```

`false` = explicit opt-out for params that aren't DB entities (file paths, git shas, channel names, worktree names).

### Guard component injected at the Column layer

New `PaneResolveGuard` component sits between `Column` and the pane's `component`. Split into two components to satisfy Rules of Hooks:

```
PaneResolveGuard (branches on whether resolve exists)
  ├─ no resolve → <Component />
  └─ has resolve → <PaneResolveGuardInner>
                      ├─ pending → <Component /> (passthrough, avoids flash)
                      ├─ found → <Component />
                      └─ not found → <NotFoundFallback /> + crash report
```

The "Not Found" fallback renders a minimal chrome header + `<Placeholder tone="error">` body, plus fires a `report({ source: "broken-link" })` crash report once.

### Pending-state handling

When `pending: true`, the guard passes through to the pane component (same as current behavior — avoids flash of "Not Found" before data arrives from WS). Only after `pending: false && !found` does the fallback appear.

### No crash reporting

The guard only renders a placeholder — no crash report. The "Not Found" state is informational, not an error. If crash reporting becomes useful later, it can be added to the guard without changing the resolve API.

## All 19 parameterized panes — classification

| Pane | Segment | Resolve strategy |
|------|---------|-----------------|
| taskDetailPane | `t/:taskId` | hook: `useResource(tasksResource)` |
| conversationPane | `c/:convId` | hook: `useResource(conversationsResource)` |
| attemptPane | `a/:attemptId` | hook: `useResource(attemptsResource)` |
| agentDetailPane | `ag/:id` | hook: `useResource(agentsResource)` |
| serverDetailPane | `s/:serverId` | hook: `useResource(serversResource)` |
| taskSidePane | `task/:taskId` | hook: `useResource(tasksResource)` |
| systemAgentDetailPane | `system/:systemId` | `false` (slot registry, not DB) |
| configDetailPane | `cd/:configPath` | `false` (static config registry) |
| pluginConvSidePane | `plugin/:pluginId` | `false` (plugin tree, not DB) |
| pluginViewPane | `p/:pluginId` | `false` (plugin tree, not DB) |
| agentSidePane | `agent/:agentId` | `false` (always opened programmatically) |
| buildDetailPane | `r/:runId` | `false` (slot host resolves) |
| globalFileTreePane | `code/:worktree` | `false` (worktree name) |
| tableDetailPane | `t/:pluginId/:tableName` | `false` (slot host) |
| screenshotPane | `screenshot/:id` | `false` (no shared resource) |
| convCommitDiffPane | `d/:sha` | `false` (git sha) |
| agentReportPane | `agent-report/:toolUseId` | `false` (JSONL event) |
| filePeekPane | `file/:worktree/:filePath*` | `false` (file path) |
| logChannelPane | `ch/:channel` | `false` (channel name) |

## Implementation

### Step 1: Extend pane types and `define()`

**File:** `plugins/primitives/plugins/pane/web/pane.ts`

- Add `ResolveHook<Params>` type
- Add `resolve` to `PaneInternal` (optional: `((params) => {pending, found}) | false`)
- Change `DefineArgs` from interface to type intersection with `ResolveField<Path>`
- Store `args.resolve` in `internal` within `define()`

### Step 2: Create PaneResolveGuard

**New file:** `plugins/primitives/plugins/pane/web/components/pane-resolve-guard.tsx`

Two components:
- `PaneResolveGuard` — if `pane.resolve` is falsy, render `<Component />`. Otherwise render `<PaneResolveGuardInner>`.
- `PaneResolveGuardInner` — calls `pane.resolve!(params)` unconditionally. On `!pending && !found`, renders fallback placeholder. Otherwise renders `<Component />`.

The fallback: minimal flex-col with a 40px header ("Not Found" title + close button) and `<Placeholder tone="error">` body. No crash report — purely informational.

### Step 3: Inject guard in Column

**File:** `plugins/layouts/plugins/miller/web/components/column.tsx`

Replace:
```tsx
const Component = entry.pane.component;
```
with:
```tsx
const Component = useMemo(() => {
  if (!entry.pane.resolve) return entry.pane.component;
  return function PaneGuard() {
    return <PaneResolveGuard pane={entry.pane} params={entry.params} />;
  };
}, [entry.pane, entry.params]);
```

### Step 4: Add resolve to entity-backed panes

Example for `taskDetailPane`:
```ts
export const taskDetailPane = Pane.define({
  id: "task-detail",
  defaultAncestors: [tasksRootPane],
  segment: "t/:taskId",
  component: TaskDetailBody,
  width: 480,
  resolve: ({ taskId }) => {
    const result = useResource(tasksResource);
    if (result.pending) return { pending: true, found: false };
    return { pending: false, found: result.data.some((t) => t.id === taskId) };
  },
});
```

Note: must use `useResource(tasksResource)` directly (not `useTask`) because `useTask` conflates pending and not-found into a single `null`.

### Step 5: Add `resolve: false` to non-entity panes

One-liner addition to each `Pane.define` call for the 13 panes in the "false" column above.

### Step 6: Export ResolveHook type

**File:** `plugins/primitives/plugins/pane/web/index.ts`

Export `ResolveHook` for pane authors who want to type-annotate.

## Verification

1. Navigate to `/tasks/t/nonexistent-id` → "Not Found" placeholder
2. Navigate to `/c/nonexistent-conv-id` → same
3. Navigate to `/tasks/t/[real-id]` → renders normally
4. Navigate to `/code/main` → renders normally (`resolve: false` path)
5. TypeScript: remove `resolve` from `taskDetailPane` → compile error
6. TypeScript: add `resolve` to `tasksRootPane` (no params) → compile error
7. Slow WS: entity panes should NOT flash "Not Found" before data arrives

## Critical files

- `plugins/primitives/plugins/pane/web/pane.ts` — type system + define()
- `plugins/primitives/plugins/pane/web/components/pane-resolve-guard.tsx` — new guard
- `plugins/layouts/plugins/miller/web/components/column.tsx` — guard injection
- `plugins/tasks/plugins/task-detail/web/panes.tsx` — exemplar entity pane
- `plugins/conversations/plugins/conversation-view/web/panes.tsx` — exemplar entity pane
