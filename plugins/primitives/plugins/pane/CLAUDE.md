# Pane

The unified pane primitive. One pane = one URL segment + one component.
The runtime source of truth is the **route store** (`currentRoute:
PaneSlot[]`), not the URL. The URL is derived for deep linking; on
navigation the route is persisted in `history.state` so back/forward
works without re-parsing. A layout renderer maps the route to a visible
arrangement — Miller columns paints each pane as a column; Full-pane
paints only the current pane. The route itself is layout-agnostic. Each
pane is self-contained: it receives `input` from its opener and
self-fetches any data it needs.

Design rationale lives in:

- `research/2026-04-23-global-unified-pane-manager-v2.md` — core design.
- `research/2026-04-23-global-unified-pane-manager-v3.md` — refinements
  (`.open()` takes full params; `useParams()` is own-only; prefix matching).
- `research/2026-04-30-plugins-miller-columns.md` — layout renderer.
- `research/2026-05-15-global-remove-after-pane-state.md` — route-first
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
  without being inside an existing route, the runtime prepends the listed
  ancestors to build a complete route. This is purely a convenience for
  "open from scratch" — it does NOT constrain where the pane can appear.
  Any pane can appear at any position in the route.
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

## Query the route from outside a pane

Use `useRouteEntry()` / `useRouteEntries()` to check whether a pane
is present in the current route and read its params — without reaching
into `_internal` or importing `usePaneMatch()`:

```tsx
// Single entry (first match, or null if absent):
const selectedId = taskDetailPane.useRouteEntry()?.params.taskId;

// Boolean presence check:
const isOpen = addServerPane.useRouteEntry() !== null;

// Multiple instances (e.g. conversationPane can appear more than once):
const convEntries = conversationPane.useRouteEntries();
const lastConv = convEntries.at(-1);
```

Each entry exposes `{ instanceId, params, fullParams }`. Use
`instanceId` with `pane.close(instanceId)` when you need to close the
specific instance you found.

## Input

Panes can receive non-URL state at creation time via `input`. Input is
persisted in `history.state` alongside the route, so it survives
back/forward navigation and doesn't depend on the opener pane remaining
in the route.

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
the caller's position in the route:

```tsx
const openPane = useOpenPane();

// Open to the right of me (default):
openPane(taskDetailPane, { taskId }, { mode: "push" });

// Insert to the left of me:
openPane(attemptPane, { attemptId }, { mode: "push", side: "left" });
```

Modes:
- `"root"` — replace the entire route with a fresh one rooted at target.
- `"push"` — insert target relative to the caller. `side: "right"`
  (default) appends after the caller, truncating siblings to the right.
  `side: "left"` inserts before the caller (skipped if already an ancestor).
- `"swap"` — replace the caller's slot in-place (same pane type,
  different params), truncating children.

## Chrome

**Every pane should wrap its body in `<PaneChrome pane={…}>`** — that's
the convention. PaneChrome renders a standard header: the title,
optional left-side actions, optional right-side actions, a promote
button (detach from ancestors and make root), and a × close button on
the far right. Both promote and close only show
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

#### Title typography is container-owned

PaneChrome wraps the title region — string **or** node — in the
canonical `<Text variant="label">` baseline (see `pane-chrome.tsx`). A
title node therefore inherits the pane-title size by CSS inheritance and
**must not set its own typography size** — per-segment weight/color
(e.g. a breadcrumb's `font-medium`/muted) still composes on top, but the
*size* comes from the container. This is the same container-enforced
pattern as `control-size` (density via context) and `icon-auto`
(em-based slot icons): the container declares it once so every title
lands on the same size with zero per-pane effort.

Enforced by `lint/no-adhoc-pane-title.ts` — an inline `<Text variant>`
inside a `PaneChrome title={…}` node fails `./singularity check` (raw
`text-*`/`leading-*` is already banned everywhere by
`text/no-adhoc-typography`; this closes the `<Text variant>` escape for
titles specifically). Scope mirrors `no-adhoc-slot-icon-size`: inline
JSX only, owner must be `PaneChrome`, no variable tracing. A deliberate
override escapes per-site via
`// eslint-disable-next-line pane/no-adhoc-pane-title -- reason`.

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

The **route store** is the single source of truth at runtime. Navigation
APIs (`openPane`, `pane.open()`, `restoreRoute`) mutate the route
directly. Each mutation:

1. Updates `currentRoute` (the in-memory `PaneSlot[]`).
2. Derives the URL via `buildRouteUrl()`.
3. Pushes (or replaces) a `history.state` entry containing the
   serialized route (paneId, params, input per slot).

On `popstate` (back/forward), the route is restored from
`history.state` — no URL re-parsing needed. URL parsing (`parseUrl`)
is only a fallback for initial page load and shared deep links.

The shell mounts a layout renderer once (e.g. `<MillerColumns/>` from
`@plugins/layouts/plugins/miller/web`, or `<FullPane/>`). The renderer
reads the route via `useRoute()` and maps it to its arrangement — Miller
lays the panes out as columns, root on the left and current pane on the
right; Full-pane shows only the current pane (`match.panes.at(-1)`).

The router rebuilds its lookup table from the
`Pane.Register` contribution list synchronously on every render via
`useSyncPaneRegistry()`, so adding or removing a pane is just adding or
removing a `Pane.Register({ pane })` entry from a plugin's
`contributions` array.

## Not yet implemented (deferred)

- `keepalive` for heavy panes — switching slots remounts by default.
- Layout tree (drag-and-drop, tabs, overlays).

See "Open questions" in the design doc.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Unified pane primitive: Pane.define and chrome components.
- Load-bearing: yes
- Web:
  - Slots: `Pane.Register` ← `active-data.plugin-link`, `apps.agent-manager.welcome`, `apps.deploy.servers`, `apps.pages.page-tree`, `apps.pages.welcome`, `apps.settings.accounts`, `apps.settings.config`, `apps.sonata.library`, `apps.story.shell`, `apps.studio.compositions`, `apps.studio.contributions`, `apps.studio.contributions.tables`, `apps.studio.explorer`, `apps.studio.graph`, `auth.google.setup-wizard`, `backup`, `build`, `code-explorer`, `config_v2.settings`, `conversations.agents`, `conversations.conversation-view`, `conversations.conversation-view.code.docs-button`, `conversations.conversation-view.code.file-pane`, `conversations.conversation-view.commits-graph`, `conversations.conversation-view.jsonl-viewer.tool-call.agent`, `conversations.conversation-view.jsonl-viewer.tool-call.workflow`, `conversations.conversation-view.push-profiling`, `conversations.conversation-view.tasks-panel`, `conversations.conversation-view.terminal-pane`, `conversations.recover`, `conversations.summary`, `debug.broadcasts`, `debug.claude-cli-calls`, `debug.live-state-health`, `debug.logs`, `debug.memory`, `debug.profiling`, `debug.profiling.build`, `debug.profiling.push`, `debug.queue`, `debug.reports`, `debug.slow-ops.pane`, `debug.worktree-cleanup`, `infra.events-test`, `plugin-meta.plugin-view`, `review`, `screenshot`, `stats`, `tasks.attempt-view`, `tasks.task-detail`, `ui.theme-engine.theme-customizer`
  - Uses: `primitives/bar.Bar`, `primitives/css/placeholder.Placeholder`, `primitives/css/text.Text`, `primitives/css/ui-kit.Button`, `primitives/css/ui-kit.iconSizeFor`, `primitives/css/ui-kit.Popover`, `primitives/css/ui-kit.PopoverContent`, `primitives/css/ui-kit.PopoverTrigger`, `primitives/css/ui-kit.useControlSize`, `primitives/icon-button.IconButton`, `primitives/loading.Loading`, `primitives/select-scope.ContentScope`, `primitives/slot-render.renderIsolated`, `primitives/surface-id.SurfaceIdContext`, `primitives/tooltip.WithTooltip`
  - Exports: Types: `InferParams`, `MatchEntry`, `PaneChromeConfig`, `PaneInternal`, `PaneMatch`, `PaneObject`, `PaneOpenMode`, `PaneRouteEntry`, `PaneSlot`, `PaneStore`, `PaneToggleOpts`, `ResolveHook`, `SurfaceChrome`, `TypeMarker`; Values: `buildRouteUrl`, `clearRoute`, `createPaneStore`, `defaultStore`, `getBasePath`, `getRoute`, `openPane`, `Pane`, `PaneActionsSlot`, `PaneBasePathContext`, `PaneChrome`, `PaneIconAction`, `PaneInstanceContext`, `PaneLayoutContext`, `PaneMatchContext`, `PaneResolveGuard`, `PaneStoreContext`, `PaneSurfaceAppContext`, `PaneSurfaceProvider`, `parseUrl`, `reorderRoute`, `restoreRoute`, `setBasePath`, `setLiveStore`, `stripBasePath`, `SurfaceChromeContext`, `type`, `useCurrentPane`, `useIndexMatch`, `useOpenPane`, `usePaneMatch`, `usePaneRoute`, `usePaneStore`, `usePaneTitle`, `usePathname`, `useRoute`, `useSurfaceAppId`, `useSyncPaneRegistry`
- Cross-plugin:
  - Imported by: `active-data/attempt`, `active-data/conv`, `active-data/plugin-link`, `active-data/task`, `active-data/task-link`, `apps`, `apps/agent-manager/welcome`, `apps/deploy/servers`, `apps/pages/content-search`, `apps/pages/page-tree`, `apps/pages/starred`, `apps/pages/welcome`, `apps/pages/welcome/quick-create`, `apps/pages/welcome/recent-pages`, `apps/settings/accounts`, `apps/settings/appearance`, `apps/settings/config`, `apps/sonata/library`, `apps/story/shell`, `apps/studio/compositions`, `apps/studio/contributions`, `apps/studio/contributions/tables`, `apps/studio/explorer`, `apps/studio/explorer/membership`, `apps/studio/graph`, `auth`, `auth/google`, `auth/google/setup-wizard`, `backup`, `build`, `code-explorer`, `config_v2/config-link`, `config_v2/settings`, `conversations/agents`, `conversations/conversation-view`, `conversations/conversation-view/code/docs-button`, `conversations/conversation-view/code/file-pane`, `conversations/conversation-view/commits-graph`, `conversations/conversation-view/jsonl-viewer/file-path`, `conversations/conversation-view/jsonl-viewer/tool-call/add-task`, `conversations/conversation-view/jsonl-viewer/tool-call/agent`, `conversations/conversation-view/jsonl-viewer/tool-call/skill`, `conversations/conversation-view/jsonl-viewer/tool-call/workflow`, `conversations/conversation-view/markdown-extensions`, `conversations/conversation-view/open-app`, `conversations/conversation-view/push-profiling`, `conversations/conversation-view/tasks-panel`, `conversations/conversation-view/terminal-pane`, `conversations/conversation-view/vscode`, `conversations/conversations-view`, `conversations/pane-restore`, `conversations/recover`, `conversations/summary`, `debug/broadcasts`, `debug/claude-cli-calls`, `debug/live-state-health`, `debug/logs`, `debug/memory`, `debug/profiling`, `debug/profiling/build`, `debug/profiling/push`, `debug/queue`, `debug/reports`, `debug/slow-ops/pane`, `debug/worktree-cleanup`, `infra/events-test`, `layouts/full-pane`, `layouts/host`, `layouts/miller`, `plugin-meta/plugin-view`, `plugin-meta/plugin-view/file-tree`, `plugin-meta/plugin-view/sub-plugins`, `primitives/app-shell`, `primitives/launch`, `review`, `screenshot`, `stats`, `stats/cost`, `tasks/attempt-view`, `tasks/task-dependencies`, `tasks/task-detail`, `tasks/task-events`, `tasks/task-graph`, `tasks/task-header`, `ui/theme-engine/theme-customizer`

<!-- AUTOGENERATED:END -->
