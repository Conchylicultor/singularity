# Multi-Tab Reactive Side-Effects

## Context

Notifications are duplicated ~5-7x in the database. Investigation revealed this matches the number of open browser tabs. The root cause is structural: any `useEffect` that reacts to shared server state (via `useResource`, `subscribeWsStatus`) and triggers I/O runs independently in every tab. There is no primitive to say "run this side-effect once globally."

## The pattern

```
useResource(sharedState) → useEffect(deps) → I/O (fetch, toast, invalidate)
```

Every tab receives the same live-state push, every tab runs the same effect, every tab fires the same I/O. Mutations are duplicated N times; reads are amplified N times.

The safe pattern — user-initiated mutations via click handlers — is correct by construction: only one tab receives the click.

## Affected entry points

### Write mutations (duplicated across tabs)

**`toast()` — 6 sites, each POSTs to `POST /api/notifications`**

`toast()` bundles two concerns: ephemeral UI toast (`ShellCommands.Toast`) + DB persistence (`fetchEndpoint(createNotification)`). The UI toast should fire per-tab; the DB write should fire once.

| # | File | Line | Trigger |
|---|---|---|---|
| 1 | `plugins/health/web/components/reconnect-watcher.tsx` | 14 | WS reconnect detected via `subscribeWsStatus` |
| 2 | `plugins/conversations/plugins/conversations-view/web/components/auto-launch-watcher.tsx` | 38 | New conversation appears in `conversationsResource` |
| 3 | `plugins/conversations/plugins/conversations-view/web/components/fork-error-watcher.tsx` | 25 | New fork error in `forkErrorsResource` |
| 4 | `plugins/build/web/components/build-button.tsx` | 59,61 | Build finishes (watched via `buildHistoryResource`) |
| 5 | `plugins/build/web/components/build-button.tsx` | 88 | Auto-build starts (watched via `buildHistoryResource`) |
| 6 | `plugins/conversations/plugins/summary/web/components/summary-pane.tsx` | 38 | Summary arrives in `conversationSummariesResource` |

**PushAndExitButton — 3 effects, each fires `DELETE /api/conversations/:id/push-and-exit`**

| # | File | Line | Trigger |
|---|---|---|---|
| 7 | `plugins/conversations/plugins/conversation-view/plugins/push-and-exit/web/components/push-and-exit-button.tsx` | 89 | Conversation loses process while job active |
| 8 | same | 98 | Job status → `"clean"` via `pushAndExitResource` |
| 9 | same | 110 | Job status → `"error"` via `pushAndExitResource` |

### Visual-only duplication (N toasts shown, no DB write)

| # | File | Line | Trigger |
|---|---|---|---|
| 10 | `plugins/notifications/web/components/bell-button.tsx` | 107 | Server-originated notification → `ShellCommands.Toast()` |

### Read amplification (N×GET per push, no corruption)

| # | File | Line | Trigger |
|---|---|---|---|
| 11 | `plugins/conversations-recover/web/components/recovery-view.tsx` | 71 | Any `conversationsResource` push → `invalidateQueries` → refetch |
| 12 | `plugins/plugin-meta/plugins/plugin-health/web/components/health-section.tsx` | 58,68 | `pluginHealthReviewsDescriptor` push → `fetch GET` staleness + tasks |
| 13 | `plugins/conversations/plugins/conversation-view/plugins/code/plugins/docs-button/web/use-pushed-doc-files.ts` | 33 | `pushesResource` push → `fetch GET` per push ID |

## Why only `toast()` and PushAndExit?

Every other mutation in the codebase is user-initiated (click handler → one tab → one mutation). `toast()` is the only function that hides a write mutation behind what looks like a UI-only call. PushAndExitButton is the only place where a raw `fetch DELETE` sits inside a reactive effect. The read-amplification cases are wasteful but not corrupting.

## Fix direction

Three layers, from most to least structural:

### 1. Server-side reactions (eliminates the problem)

Reactive side-effects in response to server state should be server-side. The server already knows when a build finishes, a job completes, a connection drops. Use `defineTriggerEvent` / `trigger()` / `defineJob` to handle these transitions server-side.

| Current (client reactive) | Target (server reaction) |
|---|---|
| BuildButton useEffect → `toast("Build succeeded")` | Build job completion → `recordNotification()` |
| ReconnectWatcher → `toast("Reconnected")` | Health endpoint / WS handler → `recordNotification()` |
| PushAndExitButton → `fetch DELETE` | Push-and-exit job cleans up its own resource on completion |
| AutoLaunchWatcher → `toast("Created")` | Conversation creation event → `recordNotification()` |

### 2. Lint rule (prevents the problem from returning)

ESLint rule that flags `fetch` / `fetchEndpoint` / `toast` / `mutate` / `invalidateQueries` inside a `useEffect` whose closure captures `useResource` results. Error message: "Server I/O inside useEffect watching shared state — fires in every open tab. Move the side-effect server-side or use a click handler."

### 3. Split `toast()` (removes the footgun)

Split `toast()` into:

- `showToast()` — ephemeral UI only (`ShellCommands.Toast`), no DB write. Safe from anywhere.
- `recordNotification()` — server-only, not exported from the web barrel.

This makes it impossible to accidentally persist a notification from the client. The function that looked harmless (`toast()`) no longer hides a write mutation.

### 4. `useServerReaction()` escape hatch (for rare legitimate cases)

If a client-side reaction to server state is genuinely needed, provide a primitive that uses `BroadcastChannel`-based leader election so only one tab fires. The lint rule would allow `useServerReaction` but ban raw `useEffect` + shared state + I/O.

```ts
// Banned by lint:
useEffect(() => {
  if (job?.status === "clean")
    fetch(`/api/.../push-and-exit`, { method: "DELETE" });
}, [job?.status]);

// Allowed — only fires in leader tab:
useServerReaction(
  () => job?.status === "clean",
  () => fetch(`/api/.../push-and-exit`, { method: "DELETE" }),
);
```

## Recommendation

Layer 1 (server-side reactions) is the structural fix. Layer 3 (split toast) is a quick win that eliminates 6 of the 9 write duplication sites. Layer 2 (lint) prevents regressions. Layer 4 is only needed if layer 1 can't cover all cases.

Priority order: split `toast()` first (immediate relief), then migrate each reactive effect server-side, then add the lint rule once the codebase is clean.
