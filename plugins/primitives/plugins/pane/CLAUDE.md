# Pane

The unified pane primitive. One pane = one URL segment + one component.
The runtime source of truth is the **route store** (`currentRoute:
PaneSlot[]`), not the URL. The URL is derived for deep linking; on
navigation the route is persisted in `history.state` so back/forward
works without re-parsing. A layout renderer maps the route to a visible
arrangement — Miller columns paints each pane as a column; Full-pane
paints only the current pane. The route itself is layout-agnostic. Each
pane is self-contained: it receives `options` / an optimistic `hint` from
its opener and self-fetches any data it needs.

Design rationale lives in:

- `research/2026-04-23-global-unified-pane-manager-v2.md` — core design.
- `research/2026-04-23-global-unified-pane-manager-v3.md` — refinements
  (`.open()` takes full params; `useParams()` is own-only; prefix matching).
- `research/2026-04-30-plugins-miller-columns.md` — layout renderer.
- `research/2026-05-15-global-remove-after-pane-state.md` — route-first
  architecture, `after:` removal, `input`/`useInput()` (since split into
  `options`/`hint` — see below), `defaultAncestors`.
- `research/2026-07-10-global-pane-input-hint-vs-options.md` — why `input`
  became `options` + `hint`, and why a hint cannot be a write source.

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
- `options` (optional) — literal DEFAULTS record for opener-supplied UI
  configuration. See **Non-URL state** below.
- `hint` (optional) — `type<T>()` marker declaring the shape of an
  optimistic, ephemeral mirror of server-owned state. See **Non-URL state**.

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

## Non-URL state: `options` and `hint`

A pane can receive state at creation time that doesn't belong in the URL.
There are exactly **two kinds**, and which one you have is decided by a
single question: **does this value have a canonical server-side owner?**

|  | `options` | `hint` |
|---|---|---|
| Canonical owner | none — the pane owns it | a live-state resource owns it |
| Absence means | the declared default | wait for canonical |
| Persisted | yes (`history.state`, tabs, pane-restore) | **never** |
| Read as | `useOptions()` → **total** `Options` | `useHint()` → `Hint<T>` |
| Safe to write back | it's UI config; nothing writes it | **never** |

There is no third kind. If a value is already in the URL — including an
ancestor pane's params — read it from the route (`ancestorPane.useRouteEntry()`),
not from either of these.

### `options` — opener-supplied UI configuration

Declare the **defaults**, not a type. The default *is* the deep-link value,
stated once:

```ts
export const taskDetailPane = Pane.define({
  id: "task-detail",
  segment: "t/:taskId",
  component: TaskDetailBody,
  options: { focused: false },
});

// Opening with a partial override:
openPane(taskDetailPane, { taskId }, { mode: "push", options: { focused: true } });

// Reading — TOTAL, never Partial, so there is nothing to `??`:
function TaskDetailBody() {
  const { focused } = taskDetailPane.useOptions();   // boolean
}
```

A pane that declares no `options` **rejects** them at the call site.

### `hint` — an optimistic mirror, structurally unwritable

A hint pre-paints server-owned state before the canonical resource settles.
It is absent on every route the browser rebuilt (deep link, reload,
back/forward) and may be stale when present. **It is never a source of truth.**

```ts
export const sonataPlayerPane = Pane.define({
  id: "sonata-player",
  segment: "song/:songId",
  component: SonataPlayerSurface,
  hint: type<{ title: string }>(),
  useTitle: useSongTitle,
});

openPane(sonataPlayerPane, { songId }, { mode: "root", hint: { title: song.title } });

function useSongTitle({ songId }: { songId: string }, hint: Hint<{ title: string }>) {
  const songs = useResource(songsResource);
  let canonical: string | undefined;
  if (!songs.pending) canonical = songs.data.find((s) => s.id === songId)?.title;
  return hint.pick("title", canonical);   // canonical wins; hint fills the gap
}
```

`Hint` holds **no data**. `pick(key, canonical)` is the only accessor and it
*requires* the canonical value — so you cannot read a hint apart from its
source of truth, and if you already hold the truth you have no reason to write
the hint. The hint is also never serialized, so it cannot outlive the
navigation that created it.

`pick` returns `T[K] | undefined`. Defaulting that to a fabricated value is
banned by `lint/no-hint-fabrication`:

```ts
hint.pick("title", canonical) ?? "Untitled"                    // ✗ fabrication
hint.pick("title", undefined)                                  // ✗ recovers the bare hint
hint.pick("title", canonical) ?? null                          // ✓ honest absence
hint.pick("title", canonical) ?? <Placeholder>Untitled</…>     // ✓ a ReactNode is never a DB value
```

> **Why this shape.** A deep-linked `/sonata/song/:id` once seeded an app-context
> mirror with `input.title ?? "Untitled"`, and a chord-grid autosave wrote
> `"Untitled"` over the real song name. `useInput()` made a possibly-absent
> display hint look like ordinary pane data. See
> `research/2026-07-10-global-pane-input-hint-vs-options.md` and
> `research/2026-07-10-sonata-song-title-single-owner.md`.
>
> If an option's default would be a **lie about server state**
> (`options: { title: "Untitled" }`), it is a hint, not an option.

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

**Every pane wraps its body in `<PaneChrome pane={…}>`** — that's the
convention, and there is no opt-out: `PaneChrome` ALWAYS renders a
header `Bar` plus exactly one body scroll (`PaneScroll`), so a pane can
never strand its own scrolling. PaneChrome renders a standard header:
the title, optional left-side actions, optional right-side actions, a
promote button (detach from ancestors and make root), and a × close
button on the far right. Both promote and close only show when
`depth > 0`.

A pane whose body is its own UI (a sidebar list, a card grid, a
`DataView`) simply gives `<PaneChrome>` a `title` and renders the body
directly as children — the body is natural-height and the chrome's
`PaneScroll` scrolls it. A pane that needs a **rich custom header**
(transport / view-switcher / volume) opts into `chrome.header` (see
**Custom header** below) — the header content changes, but the bar
height, the body wrapper, and the single scroll do not.

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

### `PaneScroll` — the sanctioned pane-body scroll viewport

`PaneScroll` (`import { PaneScroll } from
"@plugins/primitives/plugins/pane/web"`) is the single sanctioned pane-body
vertical scroll viewport — a dead-thin `<Scroll axis="y" fill h-full>`. The
mental model is: **a pane body is exactly one `PaneScroll`; every header inside
it is a `<Sticky>`** (from
`@plugins/primitives/plugins/css/plugins/sticky/web`), so toolbars and section
headers pin against this one viewport instead of each owning a nested scroller.

`PaneChrome` always routes its body through `PaneScroll`, so any pane wrapped
in `<PaneChrome>` gets the one sanctioned scroll for free and should not add its
own `overflow-*`. A body with an inner header + scrollable region (so the
chrome's `PaneScroll` is naturally inert) should still reach for `<PaneScroll>`
on the inner region rather than re-deriving `overflow-y-auto min-h-0 flex-1`.
`PaneScroll` forwards `ref` (for a host that needs the
scroll-container element, e.g. an `IntersectionObserver` root) and the rest of
`Scroll`'s surface (`hideScrollbar`, `isolate`, `as`, `className`).

### Scroll responsibility

PaneChrome's content wrapper is a `PaneScroll` (`overflow-y-auto`) — it scrolls
by default. Pane bodies should not add `overflow-*` on their root div.

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

### Custom header (`chrome.header`)

A pane with a rich toolbar (a back button + title on the left, transport
/ view-switcher / volume widgets on the right) opts into a custom header
instead of the default `title + Actions`. Build the header with
`definePaneToolbar` (from
`@plugins/primitives/plugins/pane-toolbar/web`), which exposes two
**reorderable** render-slot zones (`Start` / `End`), and wire it in via
`chrome: { header }`:

```ts
// once, at module scope (so the slots register at import):
export const MyToolbar = definePaneToolbar("myapp.toolbar");

// other plugins contribute items to either zone:
MyToolbar.Start({ id: "back", component: BackButton });
MyToolbar.End({ id: "volume", component: VolumeControl });

// the pane opts in:
export const myPane = Pane.define({
  id: "my-pane",
  segment: "my/:id",
  component: MyPaneBody,
  chrome: { header: MyToolbar },
});

// the body renders directly under PaneChrome — NO header inside it:
function MyPaneBody() {
  return (
    <PaneChrome pane={myPane}>
      <MyContent />
    </PaneChrome>
  );
}
```

`PaneChrome` renders the `Start`/`End` zones INSIDE its standard
`<Bar tier="pane">` (same height as every other pane header), in place
of the default `title` / Actions, then the promote/close buttons. There
is **no overflow-collapse** for a custom header: rich End widgets
(transport, volume slider, jog wheel) never fold into a "⋯" popover.
Hand-rolling a `border-b` header bar inside a pane body is banned by the
`no-adhoc-pane-toolbar` lint rule — route it through `chrome.header`.

## Router

The **route store** is the single source of truth at runtime. Navigation
APIs (`openPane`, `pane.open()`, `restoreRoute`) mutate the route
directly. Each mutation:

1. Updates `currentRoute` (the in-memory `PaneSlot[]`).
2. Derives the URL via `buildRouteUrl()`.
3. Pushes (or replaces) a `history.state` entry containing the
   serialized route (paneId, params, options per slot — never the `hint`,
   which is in-memory only).

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
  - Slots: `Pane.Register` ← `active-data.plugin-link`, `apps.agent-manager.welcome`, `apps.deploy.servers`, `apps.mail.inbox`, `apps.mail.reading-pane`, `apps.mail.search`, `apps.mail.shell`, `apps.mail.thread-list`, `apps.pages.page-tree`, `apps.pages.welcome`, `apps.prototypes.gallery`, `apps.settings.accounts`, `apps.settings.config`, `apps.sonata.library`, `apps.story.shell`, `apps.studio.compositions`, `apps.studio.contributions`, `apps.studio.contributions.tables`, `apps.studio.explorer`, `apps.studio.graph`, `apps.studio.release`, `apps.website.blog.site`, `apps.website.downloads`, `apps.website.pillars.agents`, `apps.website.pillars.apps`, `apps.website.pillars.platform`, `apps.website.shell`, `apps.workflows.definitions`, `apps.workflows.executions`, `auth.apple-signing.setup-wizard`, `auth.google.setup-wizard`, `backup`, `build`, `code-explorer`, `config_v2.settings`, `conversations.agents`, `conversations.all-conversations`, `conversations.conversation-view`, `conversations.conversation-view.code.docs-button`, `conversations.conversation-view.code.file-pane`, `conversations.conversation-view.commits-graph`, `conversations.conversation-view.jsonl-viewer.tool-call.agent`, `conversations.conversation-view.jsonl-viewer.tool-call.workflow`, `conversations.conversation-view.push-profiling`, `conversations.conversation-view.terminal-pane`, `conversations.recover`, `conversations.summary`, `debug.boot-profile`, `debug.broadcasts`, `debug.claude-cli-calls`, `debug.health-monitor`, `debug.heap-snapshot`, `debug.live-state-churn.emit`, `debug.live-state-health`, `debug.logs`, `debug.memory`, `debug.profiling`, `debug.profiling.build`, `debug.profiling.push`, `debug.queue`, `debug.read-set`, `debug.render-profiler`, `debug.reports`, `debug.trace.pane`, `debug.worktree-cleanup`, `debug.zero-test`, `infra.events-test`, `plugin-meta.plugin-view`, `primitives.css.layout-harness`, `review`, `screenshot`, `stats`, `tasks.attempt-view`, `tasks.task-detail`, `ui.theme-engine.theme-customizer`
  - Uses: `primitives/bar.Bar`, `primitives/css/center.Center`, `primitives/css/column.Column`, `primitives/css/measure-strip.MeasureStrip`, `primitives/css/placeholder.Placeholder`, `primitives/css/scroll.Scroll`, `primitives/css/scroll.ScrollProps`, `primitives/css/spacing.Stack`, `primitives/css/text.Text`, `primitives/css/ui-kit.Button`, `primitives/css/ui-kit.cn`, `primitives/css/ui-kit.ControlSize`, `primitives/css/ui-kit.Popover`, `primitives/css/ui-kit.PopoverContent`, `primitives/css/ui-kit.PopoverTrigger`, `primitives/css/ui-kit.SingleLineProvider`, `primitives/element-size.useResizeObserver`, `primitives/icon-button.IconButton`, `primitives/latest-ref.useLatestRef`, `primitives/loading.Loading`, `primitives/select-scope.ContentScope`, `primitives/slot-render.renderIsolated`, `primitives/surface-id.SurfaceIdContext`, `primitives/tooltip.WithTooltip`
  - Exports: Types: `AnyPane`, `Hint`, `InferParams`, `MatchEntry`, `OpenPaneFn`, `PaneChromeConfig`, `PaneHeaderZones`, `PaneInternal`, `PaneMatch`, `PaneObject`, `PaneOpenMode`, `PaneOptions`, `PaneRouteEntry`, `PaneScrollProps`, `PaneSlot`, `PaneStore`, `PaneToggleOpts`, `PaneToolbarItem`, `ParsedRoute`, `ResolveHook`, `RouteState`, `SurfaceChrome`, `TypeMarker`; Values: `buildRouteUrl`, `clearRoute`, `createPaneStore`, `defaultStore`, `getBasePath`, `getRoute`, `openPane`, `Pane`, `PaneActionsSlot`, `PaneBasePathContext`, `PaneChrome`, `PaneIconAction`, `PaneInstanceContext`, `PaneLayoutContext`, `PaneLoadScopeContext`, `PaneMatchContext`, `PaneResolveGuard`, `PaneScroll`, `PaneStoreContext`, `PaneSurfaceAppContext`, `PaneSurfaceProvider`, `parseUrl`, `reorderRoute`, `restoreRoute`, `setBasePath`, `setLiveStore`, `stripBasePath`, `SurfaceChromeContext`, `ToolbarItem`, `type`, `useCurrentPane`, `useIndexMatch`, `useOpenPane`, `usePaneMatch`, `usePaneRoute`, `usePaneStore`, `usePaneTitle`, `usePathname`, `useRenderSync`, `useRoute`, `useRouteState`, `useSurfaceAppId`, `useSyncPaneRegistry`
- Cross-plugin:
  - Imported by: `active-data/attempt`, `active-data/conv`, `active-data/plugin-link`, `active-data/task`, `active-data/task-link`, `apps-core`, `apps-core/layout`, `apps-core/tab-surface`, `apps-core/tabs`, `apps/agent-manager/shell`, `apps/agent-manager/welcome`, `apps/browser/shell`, `apps/debug/shell`, `apps/deploy/servers`, `apps/deploy/shell`, `apps/file-explorer/shell`, `apps/home/shell`, `apps/mail/inbox`, `apps/mail/mailbox`, `apps/mail/reading-pane`, `apps/mail/search`, `apps/mail/shell`, `apps/mail/thread-list`, `apps/pages/content-search`, `apps/pages/page-tree`, `apps/pages/shell`, `apps/pages/welcome`, `apps/pages/welcome/quick-create`, `apps/pages/welcome/recent-pages`, `apps/prototypes/gallery`, `apps/prototypes/shell`, `apps/settings/accounts`, `apps/settings/appearance`, `apps/settings/config`, `apps/settings/shell`, `apps/sonata/library`, `apps/sonata/shell`, `apps/story/shell`, `apps/studio/compositions`, `apps/studio/contributions`, `apps/studio/contributions/tables`, `apps/studio/explorer`, `apps/studio/explorer/membership`, `apps/studio/graph`, `apps/studio/release`, `apps/studio/shell`, `apps/website/blog/site`, `apps/website/demos/plugin-pyramid`, `apps/website/demos/release-switcher`, `apps/website/downloads`, `apps/website/landing/cta`, `apps/website/landing/pillars`, `apps/website/pillars/agents`, `apps/website/pillars/apps`, `apps/website/pillars/platform`, `apps/website/shell`, `apps/workflows/definitions`, `apps/workflows/executions`, `apps/workflows/shell`, `auth`, `auth/apple-signing/setup-wizard`, `auth/google`, `auth/google/setup-wizard`, `backup`, `build`, `code-explorer`, `config_v2/config-link`, `config_v2/settings`, `conversations`, `conversations/agents`, `conversations/all-conversations`, `conversations/conversation-view`, `conversations/conversation-view/code/docs-button`, `conversations/conversation-view/code/file-pane`, `conversations/conversation-view/commits-graph`, `conversations/conversation-view/jsonl-viewer/file-path`, `conversations/conversation-view/jsonl-viewer/tool-call/add-task`, `conversations/conversation-view/jsonl-viewer/tool-call/agent`, `conversations/conversation-view/jsonl-viewer/tool-call/skill`, `conversations/conversation-view/jsonl-viewer/tool-call/workflow`, `conversations/conversation-view/markdown-extensions`, `conversations/conversation-view/open-app`, `conversations/conversation-view/push-profiling`, `conversations/conversation-view/terminal-pane`, `conversations/conversation-view/vscode`, `conversations/conversations-view`, `conversations/pane-restore`, `conversations/recover`, `conversations/summary`, `debug/boot-profile`, `debug/broadcasts`, `debug/claude-cli-calls`, `debug/health-monitor`, `debug/heap-snapshot`, `debug/live-state-churn/emit`, `debug/live-state-health`, `debug/logs`, `debug/memory`, `debug/profiling`, `debug/profiling/build`, `debug/profiling/push`, `debug/queue`, `debug/read-set`, `debug/render-profiler`, `debug/reports`, `debug/timeline`, `debug/trace/engine`, `debug/trace/pane`, `debug/worktree-cleanup`, `debug/zero-test`, `infra/events-test`, `layouts/full-pane`, `layouts/host`, `layouts/miller`, `layouts/route-fallback`, `plugin-meta/contributions-table`, `plugin-meta/plugin-view`, `plugin-meta/plugin-view/dependencies`, `plugin-meta/plugin-view/file-tree`, `plugin-meta/plugin-view/sub-plugins`, `primitives/app-shell`, `primitives/css/layout-harness`, `primitives/launch`, `primitives/pane-toolbar`, `reports`, `review`, `screenshot`, `stats`, `stats/cost`, `tasks/attempt-view`, `tasks/task-dependencies`, `tasks/task-deps-tree`, `tasks/task-detail`, `tasks/task-events`, `tasks/task-graph`, `tasks/task-header`, `tasks/tasks-core`, `ui/theme-engine/theme-customizer`
- Core:
  - Exports: Types: `AppRef`, `InferParams`, `RouteDef`; Values: `defineApp`, `defineRoute`, `fillSegment`, `normalizeSegmentPattern`

<!-- AUTOGENERATED:END -->
