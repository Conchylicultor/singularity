# Pane

The unified pane primitive. One pane = one URL segment + one component with
its own `<Outlet/>`. Nested URLs map to nested panes; ancestor data flows to
descendants via typed `provides` / `useData()`.

See the design doc at
`research/2026-04-23-global-unified-pane-manager-v2.md` for the full rationale
and migration plan.

## Define a pane

```ts
import { Pane, Outlet, type } from "@plugins/pane/web";

export const tasksRootPane = Pane.define({
  id: "tasks-root",
  path: "/tasks",
  component: TasksRoot,
});

export const taskDetailPane = Pane.define({
  id: "task-detail",
  parent: tasksRootPane,
  path: ":taskId",                      // full: /tasks/:taskId
  component: TaskDetail,
  provides: type<{ task: Task }>(),
});
```

Rules:

- `id` is a stable string; used for slot keys and debug output.
- `parent` is another `Pane` value. Omit for top-level panes.
- `path` is appended to the parent's path. Supports `:param` and `:rest*`
  (wildcard). Omit for "no URL segment of my own".
- `component` renders the pane body. It may render `<Outlet/>` to host a
  child pane, and `<pane.Provider value={…}>` to expose data via
  `provides`.

## Read params and ancestor data

```tsx
function TaskDetail() {
  const { taskId } = taskDetailPane.useParams();           // typed
  const task = useTask(taskId);
  if (!task) return <NotFound />;
  return (
    <taskDetailPane.Provider value={{ task }}>
      <Outlet />
    </taskDetailPane.Provider>
  );
}

function SomeDescendant() {
  const { task } = taskDetailPane.useData();               // typed
  const { convId } = taskConversationPane.useParams();     // typed
}
```

`useParams()` is own-only. Reading an ancestor's params is explicit:
`ancestorPane.useParams()`.

## Navigate

```tsx
<button onClick={() => taskDetailPane.open({ taskId })}>Open</button>
```

`open(params)` pushes a new URL. `close()` navigates to the parent.
`back()`/`forward()` walk browser history.

## Chrome

Each pane auto-creates an `Actions` slot. Other plugins contribute:

```ts
taskDetailPane.Actions({ component: RefreshButton });
```

`<PaneChrome pane={…} title="…">` renders a standard header (‹ › buttons,
actions, expand). Opt out with `chrome: false` in `Pane.define` and compose
pieces manually with `<PaneHistoryButtons/>` and `<PaneActionsSlot/>`.

## Router

`<PaneRouter/>` is rendered once by the shell. It reads the URL, picks the
longest matching pane chain, and mounts it top-down. Child panes mount via
`<Outlet/>`. Registration happens at module-load time (the `Pane.define`
call itself), so the pane file must be imported — usually via the plugin's
`web/index.ts`.

## Not yet implemented (deferred)

- Pane-scoped ‹ › history stack (chrome buttons currently fall back to
  `window.history.back/forward`).
- Component-identity stability trick from `shell-layout.tsx` for pattern
  changes (nested navigations within the same pane component reconcile
  naturally).
- `keepalive` for heavy panes.
- Layout tree (drag-and-drop, tabs, overlays).

See Phase 3+ in the design doc.
