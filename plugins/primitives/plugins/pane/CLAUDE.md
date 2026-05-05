# Pane

The unified pane primitive. One pane = one URL segment + one component.
Nested URLs map to a chain of panes (root → leaf); the layout renderer
(currently Miller columns) arranges the chain as a horizontal sequence of
columns. Ancestor data flows to descendants via typed `provides` /
`provide` / `useData()`.

Design rationale lives in:

- `research/2026-04-23-global-unified-pane-manager-v2.md` — core design.
- `research/2026-04-23-global-unified-pane-manager-v3.md` — refinements
  (`.open()` takes full params; `useParams()` is own-only; prefix matching).
- `research/2026-04-30-plugins-miller-columns.md` — layout renderer that
  introduced sibling-column rendering and the `provide` field.

## Define a pane

```ts
// plugins/tasks/web/panes.ts
import { Pane, type } from "@plugins/primitives/plugins/pane/web";

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

Then register each pane from your plugin's `index.ts`:

```ts
// plugins/tasks/web/index.ts
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { tasksRootPane, taskDetailPane } from "./panes";

export default {
  id: "tasks",
  contributions: [
    Pane.Register({ pane: tasksRootPane }),
    Pane.Register({ pane: taskDetailPane }),
    // …other contributions
  ],
} satisfies PluginDefinition;
```

`Pane.define` is a pure factory: it returns a typed `PaneObject` you
can call (`.open(...)`, `.useParams()`, `.Actions(...)`) but does not
register the pane with the matcher. `Pane.Register({ pane })` is what
makes the URL routable. A defined-but-not-registered pane will compile
fine but never match — register every pane your plugin owns.

Rules:

- `id` is a stable string; used for slot keys and debug output.
- `parent` is another `Pane` value. Omit for top-level panes.
- `path` is appended to the parent's path. Supports `:param` and `:rest*`
  (wildcard). Omit for "no URL segment of my own".
- `component` renders the pane body.
- `width` (optional) — default column width in pixels for layout
  renderers that arrange panes as columns (Miller). Last column flex-grows
  regardless. Defaults to 400.
- `provide` (optional) — required when `provides:` is set AND descendants
  may read via `useData()` from sibling columns. See **Provide data** below.

## Read params and ancestor data

```tsx
function TaskDetail() {
  const { task } = taskDetailPane.useData();               // typed
  return <PaneChrome pane={taskDetailPane} title={task.title}>…</PaneChrome>;
}

function SomeDescendant() {
  const { task } = taskDetailPane.useData();               // typed
  const { convId } = taskConversationPane.useParams();     // typed, own-only
}
```

`useParams()` is own-only: it returns only the `:name` segments from *this*
pane's `path`, not any inherited from ancestors. Reading an ancestor's
params is explicit: `ancestorPane.useParams()`.

## Provide data

When a pane declares `provides: type<T>()` AND any descendant pane reads
that data via `pane.useData()`, the pane MUST also set `provide:` — a
component that loads the data and wraps children in
`<thisPane.Provider value={data}>{children}</thisPane.Provider>`.

```tsx
function ConversationPaneProvide({ children }: { children: ReactNode }) {
  const { convId } = conversationPane.useParams();
  const conv = useConversation(convId);
  if (!conv) return <LoadingPlaceholder />;
  return (
    <conversationPane.Provider value={{ conversation: conv }}>
      {children}
    </conversationPane.Provider>
  );
}

export const conversationPane = Pane.define({
  id: "conversation",
  path: "/c/:convId",
  component: ConversationView,
  provides: type<{ conversation: ConversationRecord }>(),
  provide: ConversationPaneProvide,
});
```

Why this exists: the layout renderer (Miller columns) arranges sibling
panes side-by-side as separate columns rather than nesting child panes
inside the parent's React tree. A Provider rendered inside the parent's
own component therefore can't reach sibling columns. `provide` is
composed by the layout renderer at the chain level — wrapped around the
entire row of columns — so every descendant has access to every
ancestor's provided data. The pane's own `component` does not need to
render the Provider; it just calls `pane.useData()` and trusts the
chain-level wrapper.

Loading state: a `provide` component may return a placeholder element
when data isn't ready (instead of `<Provider>{children}</Provider>`).
That suspends the chain — the placeholder replaces the entire row of
columns until data resolves. Pick the placeholder UI carefully: a tall
"Loading X…" message is usually fine.

If a pane sets `provides:` but no descendant ever reads the data via a
sibling column (the data is only used by the pane's own component or by
children rendered via `<Outlet/>`), `provide` is optional — render
`<pane.Provider>` inside the component as before.

## Navigate

```tsx
// Top-level pane (no parent path segments):
<button onClick={() => tasksRootPane.open({})}>Tasks</button>

// Nested pane: open() takes the full ancestor+own param set, since the
// router builds the URL from the pane's fullPath.
<button
  onClick={() => taskConversationPane.open({ taskId, convId })}
>Open</button>
```

`open(params)` pushes a new URL. `close()` navigates to the parent.
`back()`/`forward()` walk browser history.

## Chrome

**Every pane should wrap its body in `<PaneChrome pane={…}>`** — that's
the convention. PaneChrome renders a standard header: ‹ › history
buttons, the title, optional left-side actions, optional right-side
actions, an optional expand button, and a × close button on the far
right (for panes with a parent). Panes whose body is its own UI
(sidebar lists, list of cards, etc.) and don't need a chrome header may
opt out with `chrome: false` in `Pane.define`.

```tsx
function TaskDetailBody() {
  const { task } = taskDetailPane.useData();   // provided at the chain level via `provide`
  return (
    <PaneChrome pane={taskDetailPane} title={task.title}>
      <TaskDetailSections taskId={task.id} />
    </PaneChrome>
  );
}
```

If the pane provides data to descendants, load it in `provide` (see
**Provide data** above) — not inside the visual component. The visual
component reads via `useData()` and trusts the provider was wrapped at
the chain level.

Title resolution: the `title` prop wins; otherwise PaneChrome falls
back to the pane's `chrome.title` config (`string | (params) =>
string`). Use the prop when the title needs loaded data; use the config
when it's static or derivable from URL params.

### Actions

Each pane auto-creates an `Actions` slot. Other plugins contribute:

```ts
taskDetailPane.Actions({ component: RefreshButton });
taskDetailPane.Actions({ component: StatusBadge, position: "left" });
```

`position` defaults to `"right"`. `"left"` sits immediately after the
title — use it for status chips or context badges that follow the title.
`"right"` sits after the title spacer with the rest of the toolbar.

For the common ghost-icon-button case, use the shared
`<PaneIconAction>`:

```tsx
import { PaneIconAction } from "@plugins/primitives/plugins/pane/web";
import { MdRocketLaunch } from "react-icons/md";

function OpenAppButton() {
  const { task } = taskDetailPane.useData();
  return (
    <PaneIconAction
      label="Open app"
      icon={MdRocketLaunch}
      onClick={() => window.open(`/foo/${task.id}`)}
    />
  );
}
```

`<PaneIconAction>` forwards refs so it composes with components that
need a button ref. (Base UI Popover triggers don't take `asChild` — use
`<PopoverTrigger className={buttonVariants({variant:"ghost",size:"icon"})}>`
directly when the trigger needs to be a popover.)

### Hiding the close button

```ts
Pane.define({
  id: "task-detail",
  parent: tasksRootPane,
  path: ":taskId",
  component: TaskDetailBody,
  chrome: { close: false },
});
```

Use this when the close button doesn't belong (e.g. a pane that
already navigates somewhere else on close, or one whose parent isn't
a meaningful "back" target).

### Opting out

```ts
Pane.define({ id: "tasks-root", path: "/tasks", component: TasksRoot, chrome: false });
```

Use this for panes whose body is its own UI (sidebar lists, raw
content) and doesn't need the standard header. The pane component
renders directly inside its column with no chrome wrapper.

## Router

The shell mounts a layout renderer once (currently `<MillerColumns/>`
from `@plugins/layouts/plugins/miller/web`). The renderer reads the
URL, picks the longest matching pane chain via `matchRegistry`, and
arranges the chain as a horizontal sequence of columns — root on the
left, leaf on the right. The legacy `<PaneRouter/>` (which mounts only
the root and relies on nested `<Outlet/>` calls) is still exported but
not mounted anywhere.

`<Outlet/>` is also exported but unused by current panes; under Miller
each pane is rendered in its own column rather than nested inside the
parent. Pane components no longer call `<Outlet/>`.

The router rebuilds its lookup table from the
`Pane.Register` contribution list synchronously on every render via
`useSyncPaneRegistry()`, so adding or removing a pane is just adding or
removing a `Pane.Register({ pane })` entry from a plugin's
`contributions` array.

## Not yet implemented (deferred)

- Pane-scoped ‹ › history stack (chrome buttons currently fall back to
  `window.history.back/forward`).
- `keepalive` for heavy panes — switching slots remounts by default.
- Layout tree (drag-and-drop, tabs, overlays).

See "Open questions" in the design doc.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Unified pane primitive: Pane.define, <Outlet/>, <PaneRouter/>, and chrome components.
- Load-bearing: yes
- Defines:
  - Slots: `Pane.Register`
- Exports (web):
  - Types: `InferParams`, `MatchEntry`, `PaneChromeConfig`, `PaneInternal`, `PaneMatch`, `PaneObject`, `PaneSlot`, `TypeMarker`
  - Values: `buildChainUrl`, `getChain`, `Outlet`, `Pane`, `PaneActionsSlot`, `PaneChrome`, `PaneDepthContext`, `PaneHistoryButtons`, `PaneIconAction`, `PaneLayoutContext`, `PaneLevel`, `PaneMatchContext`, `PaneRouter`, `parseUrl`, `syncChainFromUrl`, `type`, `useCurrentPane`, `useMatchForPath`, `usePaneMatch`, `usePathname`, `useSyncPaneRegistry`
- Slot contributors: `agents`, `attempt-view`, `auth`, `claude-cli-calls`, `code-explorer`, `commits-graph`, `config`, `conversation-view`, `conversations-recover`, `cost`, `db-backup`, `docs-button`, `events-test`, `file-pane`, `logs`, `memory`, `publish`, `queue`, `review`, `screenshot`, `side-conversation`, `side-task`, `stats`, `summary`, `task-detail`, `task-file-peek`, `tasks-panel`, `terminal-pane`, `welcome`, `worktree-cleanup`

<!-- AUTOGENERATED:END -->
