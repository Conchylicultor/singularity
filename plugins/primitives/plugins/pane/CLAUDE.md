# Pane

The unified pane primitive. One pane = one URL segment + one component.
The runtime source of truth is the **chain store** (`currentChain:
PaneSlot[]`), not the URL. The URL is derived for deep linking; on
navigation the chain is persisted in `history.state` so back/forward
works without re-parsing. The layout renderer (currently Miller columns)
arranges the chain as a horizontal sequence of columns. Each pane is
self-contained: it receives `input` from its opener and self-fetches
any data it needs.

Design rationale lives in:

- `research/2026-04-23-global-unified-pane-manager-v2.md` — core design.
- `research/2026-04-23-global-unified-pane-manager-v3.md` — refinements
  (`.open()` takes full params; `useParams()` is own-only; prefix matching).
- `research/2026-04-30-plugins-miller-columns.md` — layout renderer.
- `research/2026-05-15-global-remove-after-pane-state.md` — chain-first
  architecture, `after:` removal, `input`/`useInput()`, `defaultAncestors`.

## Define a pane

```ts
// plugins/tasks/web/panes.ts
import { Pane } from "@plugins/primitives/plugins/pane/web";

export const tasksRootPane = Pane.define({
  id: "tasks-root",
  segment: "tasks",
  component: TasksRoot,
});

export const taskDetailPane = Pane.define({
  id: "task-detail",
  defaultAncestors: [tasksRootPane],  // hint: prepend tasksRootPane when opening from scratch
  segment: "t/:taskId",
  component: TaskDetail,
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
- `defaultAncestors` (optional) — a hint for `openPane` when no caller
  context exists. When a pane is opened via `.open()` or `openPane()`
  without being inside an existing chain, the runtime prepends the listed
  ancestors to build a complete chain. This is purely a convenience for
  "open from scratch" — it does NOT constrain where the pane can appear.
  Any pane can appear at any position in the chain.
- `segment` is the pane's own URL fragment (no leading slash). Supports
  `:param` and `:rest*` (wildcard). Omit for "no URL segment of my own".
  **Segments with params must have a static prefix** (e.g. `t/:taskId`,
  not bare `:taskId`) to avoid URL parsing ambiguity. Segments must be
  globally unique across all registered panes.
- `component` renders the pane body.
- `width` (optional) — default column width in pixels for layout
  renderers that arrange panes as columns (Miller). Last column flex-grows
  regardless. Defaults to 400.
- `input` (optional) — `type<T>()` marker declaring the shape of
  non-URL state this pane accepts at creation time. See **Input** below.

## Read params

```tsx
function TaskDetail() {
  const { taskId } = taskDetailPane.useParams();           // typed, own-only
  const task = useTask(taskId);                             // self-fetch
  return <PaneChrome pane={taskDetailPane} title={task?.title}>…</PaneChrome>;
}
```

`useParams()` is own-only: it returns only the `:name` segments from *this*
pane's `segment`, not any inherited from ancestors. Reading an ancestor's
params is explicit: `ancestorPane.useParams()`.

## Query the chain from outside a pane

Use `useChainEntry()` / `useChainEntries()` to check whether a pane
is present in the current chain and read its params — without reaching
into `_internal` or importing `usePaneMatch()`:

```tsx
// Single entry (first match, or null if absent):
const selectedId = taskDetailPane.useChainEntry()?.params.taskId;

// Boolean presence check:
const isOpen = addServerPane.useChainEntry() !== null;

// Multiple instances (e.g. conversationPane can appear more than once):
const convEntries = conversationPane.useChainEntries();
const lastConv = convEntries.at(-1);
```

Each entry exposes `{ instanceId, params, fullParams }`. Use
`instanceId` with `pane.close(instanceId)` when you need to close the
specific instance you found.

## Input

Panes can receive non-URL state at creation time via `input`. Input is
persisted in `history.state` alongside the chain, so it survives
back/forward navigation and doesn't depend on the opener pane remaining
in the chain.

```ts
export const myPane = Pane.define({
  id: "my-pane",
  segment: "my/:id",
  component: MyPaneBody,
  input: type<{ preloadedTitle: string }>(),
});

// Opening with input:
openPane(myPane, { id: "123" }, { input: { preloadedTitle: "Hello" } });

// Reading input inside the pane:
function MyPaneBody() {
  const { preloadedTitle } = myPane.useInput();
  // preloadedTitle is available even if the opener pane is closed
}
```

Use `input` for data the pane needs but that doesn't belong in the URL
(too long, not meaningful as a deep link, or ephemeral context from the
opener). The canonical data should still be fetched by the pane itself
— `input` provides optimistic/preloaded values, not the source of truth.

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
`promote()` detaches from ancestors and makes this pane the root.
`back()`/`forward()` walk browser history.

### `useOpenPane` — caller-aware navigation

Inside a pane component, `useOpenPane()` returns a function that knows
the caller's position in the chain:

```tsx
const openPane = useOpenPane();

// Open to the right of me (default):
openPane(taskDetailPane, { taskId }, { mode: "push" });

// Insert to the left of me:
openPane(attemptPane, { attemptId }, { mode: "push", side: "left" });
```

Modes:
- `"root"` — replace the entire chain with a fresh one rooted at target.
- `"push"` — insert target relative to the caller. `side: "right"`
  (default) appends after the caller, truncating siblings to the right.
  `side: "left"` inserts before the caller (skipped if already an ancestor).
- `"swap"` — replace the caller's slot in-place (same pane type,
  different params), truncating children.

## Chrome

**Every pane should wrap its body in `<PaneChrome pane={…}>`** — that's
the convention. PaneChrome renders a standard header: ‹ › history
buttons, the title, optional left-side actions, optional right-side
actions, a promote button (detach from ancestors and make root), and
a × close button on the far right. Both promote and close only show
when `depth > 0`. Panes whose body is its own UI
(sidebar lists, list of cards, etc.) and don't need a chrome header may
opt out with `chrome: false` in `Pane.define`.

```tsx
function TaskDetailBody() {
  const { taskId } = taskDetailPane.useParams();
  const task = useTask(taskId);                 // self-fetch
  return (
    <PaneChrome pane={taskDetailPane} title={task?.title}>
      <TaskDetailSections taskId={taskId} />
    </PaneChrome>
  );
}
```

Title resolution: the `title` prop wins; otherwise PaneChrome falls
back to the pane's `chrome.title` config (`string | (params) =>
string`). Use the prop when the title needs loaded data; use the config
when it's static or derivable from URL params.

### Scroll responsibility

PaneChrome's content wrapper is `overflow-y-auto` — it scrolls by
default. Pane bodies should not add `overflow-*` on their root div.

- **Simple content** → do nothing. PaneChrome scrolls.
- **Header + scrollable body** → root is `flex h-full flex-col`.
  Sub-header is fixed, body is `flex-1 min-h-0 overflow-auto`.
  PaneChrome's scroll is naturally inert (`h-full` fills it exactly).
- **Custom viewport** (terminal, canvas) → root is `h-full`.
  `overflow-hidden` on root is acceptable as a defensive measure.

Exception: if the pane needs a ref to the scroll container (e.g.
IntersectionObserver root), it may keep its own `overflow-y-auto`
div with `h-full` — PaneChrome's scroll stays inert.

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
  const { taskId } = taskDetailPane.useParams();
  return (
    <PaneIconAction
      label="Open app"
      icon={MdRocketLaunch}
      onClick={() => window.open(`/foo/${taskId}`)}
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

### Hiding the promote button

```ts
Pane.define({
  id: "agent-side",
  segment: "agent/:agentId",
  component: AgentSideBody,
  chrome: { promote: false },
});
```

Use this for compact side-panels that have their own expand action
(e.g. an Action button that opens the full detail pane as root).

### Opting out

```ts
Pane.define({ id: "tasks-root", path: "/tasks", component: TasksRoot, chrome: false });
```

Use this for panes whose body is its own UI (sidebar lists, raw
content) and doesn't need the standard header. The pane component
renders directly inside its column with no chrome wrapper.

## Router

The **chain store** is the single source of truth at runtime. Navigation
APIs (`openPane`, `pane.open()`, `restoreChain`) mutate the chain
directly. Each mutation:

1. Updates `currentChain` (the in-memory `PaneSlot[]`).
2. Derives the URL via `buildChainUrl()`.
3. Pushes (or replaces) a `history.state` entry containing the
   serialized chain (paneId, params, input per slot).

On `popstate` (back/forward), the chain is restored from
`history.state` — no URL re-parsing needed. URL parsing (`parseUrl`)
is only a fallback for initial page load and shared deep links.

The shell mounts a layout renderer once (currently `<MillerColumns/>`
from `@plugins/layouts/plugins/miller/web`). The renderer reads the
chain via `useMatchForChain()` and arranges it as a horizontal sequence
of columns — root on the left, leaf on the right.

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

- Description: Unified pane primitive: Pane.define and chrome components.
- Load-bearing: yes
- Web:
  - Slots: `Pane.Register`
  - Exports: Types: `InferParams`, `MatchEntry`, `PaneChainEntry`, `PaneChromeConfig`, `PaneInternal`, `PaneMatch`, `PaneObject`, `PaneOpenMode`, `PaneSlot`, `PaneToggleOpts`, `ResolveHook`, `TypeMarker`; Values: `buildChainUrl`, `getBasePath`, `getChain`, `openPane`, `Pane`, `PaneActionsSlot`, `PaneBasePathContext`, `PaneChrome`, `PaneHistoryButtons`, `PaneIconAction`, `PaneInstanceContext`, `PaneLayoutContext`, `PaneMatchContext`, `PaneResolveGuard`, `parseUrl`, `reorderChain`, `restoreChain`, `setBasePath`, `stripBasePath`, `type`, `useCurrentPane`, `useMatchForChain`, `useMatchForPath`, `useOpenPane`, `usePaneMatch`, `usePathname`, `useSyncPaneRegistry`
- Cross-plugin:
  - Slot contributors: `agent`, `agents`, `attempt-view`, `auth`, `backup`, `broadcasts`, `build`, `catalog`, `claude-cli-calls`, `code-explorer`, `commits-graph`, `conversation-view`, `conversations-recover`, `docs-button`, `events-test`, `file-pane`, `logs`, `memory`, `plugin-link`, `plugin-view`, `profiling`, `publish`, `push-profiling`, `queue`, `review`, `screenshot`, `servers`, `settings`, `setup-wizard`, `side-task`, `stats`, `summary`, `tables`, `task-detail`, `tasks-panel`, `terminal-pane`, `theme-customizer`, `welcome`, `worktree-cleanup`

<!-- AUTOGENERATED:END -->
