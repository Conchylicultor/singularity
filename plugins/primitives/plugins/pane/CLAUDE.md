# Pane

The unified pane primitive. One pane = one URL segment + one component. The
runtime source of truth is the **route store** (`currentRoute: PaneSlot[]`), not
the URL: the URL is derived for deep linking, and the route is persisted in
`history.state` so back/forward works without re-parsing. The route is
layout-agnostic — a layout renderer maps it to an arrangement (Miller paints
each pane as a column; Full-pane paints only the current pane). Each pane is
self-contained: it receives `options` / an optimistic `hint` from its opener and
self-fetches any data it needs.

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
export const tasksRootPane = Pane.define({
  id: "tasks-root", app: agentManagerApp, segment: "tasks", component: TasksRoot,
});

export const taskDetailPane = Pane.define({
  id: "task-detail",
  app: agentManagerApp,               // mandatory — see "A pane's home app" below
  defaultAncestors: [tasksRootPane],  // prepend when opening from scratch
  segment: "t/:taskId",
  component: TaskDetail,
});
```

`Pane.define` is a pure factory: it returns a typed `PaneObject` (`.open()`,
`.useParams()`, `.Actions()`) but does NOT make the URL routable. Register every
pane your plugin owns with a `Pane.Register({ pane })` entry in the plugin's
`contributions` array — a defined-but-unregistered pane compiles fine and never
matches.

Rules:

- `defaultAncestors` is only a hint for opening from scratch (no caller
  context) — it does NOT constrain where the pane can appear. Any pane can
  appear at any position in the route.
- `segment` is the pane's own URL fragment (no leading slash); supports `:param`
  and `:rest*`. Omit for "no URL segment of my own". A bare leading `:param`
  throws at define time (add a static prefix, e.g. `t/:taskId`); global
  uniqueness is enforced by the `pane:segments-unique` check.
- `width` (optional) — default column width in pixels for column layouts
  (Miller). Last column flex-grows regardless. Defaults to 400.
- `options` / `hint` — see **Non-URL state** below.

## Read params

`pane.useParams()` is **own-only**: it returns only the `:name` segments from
*this* pane's `segment`, not any inherited from ancestors. Reading an ancestor's
params is explicit: `ancestorPane.useParams()`.

## Query the route from outside a pane

The route match is a property of the **surface**, not of the layout renderer
that paints the main area. `PaneSurfaceProvider` resolves it once for the whole
surface subtree, so a sidebar, a pane toolbar and a pane body all read the same
match.

Use `pane.useRouteEntry()` (first match, or `null`) / `pane.useRouteEntries()`
(for panes that can appear more than once, e.g. `conversationPane`) to check
presence and read params — without reaching into `_internal` or importing
`usePaneMatch()`. Each entry is `{ instanceId, params, fullParams }`; pass
`instanceId` to `pane.close(instanceId)` to close the specific instance found.

**Outside every surface there is no route to read.** Global chrome (the action
bar at `Core.Root`, `Apps.TabBarActions`) is not inside any
`PaneSurfaceProvider`, so these hooks throw there rather than returning a
plausible-looking `null` — the same policy as `usePaneStore()`. `null` stays a
legitimate *in-surface* answer ("this pane is not in the route"). Global chrome
navigates with `navigate()` from `@plugins/apps-core/plugins/tabs/web`.

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
Pane.define({ id: "file", segment: "f/:path", component: FileBody, options: { compact: false } });
openPane(filePane, { path }, { mode: "push", options: { compact: true } });  // partial override
```

`filePane.useOptions()` is **TOTAL**, never `Partial` — nothing to `??` at a
read site. A pane that declares no `options` **rejects** them at the call site.

### `hint` — an optimistic mirror, structurally unwritable

A hint pre-paints server-owned state before the canonical resource settles.
It is absent on every route the browser rebuilt (deep link, reload,
back/forward) and may be stale when present. **It is never a source of truth.**

```ts
Pane.define({ …, hint: type<{ title: string }>(), useTitle: useSongTitle });

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

> **Why this shape.** The old `useInput()` made a possibly-absent display hint
> look like ordinary pane data: a deep-linked song seeded an app-context mirror
> with `input.title ?? "Untitled"` and a chord-grid autosave wrote `"Untitled"`
> over the real name. See
> `research/2026-07-10-global-pane-input-hint-vs-options.md` and
> `research/2026-07-10-sonata-song-title-single-owner.md`.
>
> The lint rule cannot decide the *declaration*: if an option's default would be
> a **lie about server state** (`options: { title: "Untitled" }`), it is a hint,
> not an option.

## Navigate

`pane.open(params)` pushes a new URL and takes the **full ancestor + own** param
set (the router builds the URL from the pane's `fullPath`). `close()` navigates
to the parent, `promote()` detaches from ancestors and makes this pane the root,
`back()`/`forward()` walk browser history.

### `useOpenPane` — caller-aware navigation

Inside a pane component, `useOpenPane()` returns an
`openPane(pane, params, opts)` that knows the caller's position in the route.
Modes:

- `"root"` — replace the entire route with a fresh one rooted at target.
- `"push"` — insert target relative to the caller. `side: "right"`
  (default) appends after the caller, truncating siblings to the right.
  `side: "left"` inserts before the caller (skipped if already an ancestor).
- `"swap"` — replace the caller's slot in-place (same pane type,
  different params), truncating children.

## Chrome

**Every pane wraps its body in `<PaneChrome pane={…}>`** — there is no opt-out:
`PaneChrome` ALWAYS renders a header `Bar` plus exactly one body scroll
(`PaneScroll`), so a pane can never strand its own scrolling. The standard
header is: title, left Actions, right Actions, promote, × close. Promote and
close only show when `depth > 0`.

A pane that needs a **rich custom header** (transport / view-switcher / volume)
opts into `chrome.header` (see **Custom header** below) — the header content
changes, but the bar height, the body wrapper, and the single scroll do not.

Title resolution: the `title` prop wins; otherwise PaneChrome falls back to the
pane's `chrome.title` config (`string | (params) => string`). Use the prop when
the title needs loaded data; use the config when it's static or derivable from
URL params.

#### Tab / document title ownership (`titleOwner`)

The pane's own header title (above) is distinct from the **tab/document title**.
That one is resolved per route by the tab surface via `usePaneTitle` (the pane's
`useTitle` hook, falling back to `chrome.title`), against the route's **title
owner**: the FIRST pane in the route declaring `titleOwner: true`.

`titleOwner` marks a **main surface** — a pane whose entity is the identity of
the page (a conversation, a task, a page, a song), as opposed to navigation
lists/trees or auxiliary tool panes (file peek, review, terminal).
First-owner-wins gives the right answer in both directions from one static
declaration: aux panes stacked to the right never steal the title, and the same
conversation pane opened as a drill-in under a task stays subordinate to it.
Routes with no title owner fall back to the leaf pane (then the app index pane,
then the app name).

Declaring `titleOwner` without a `useTitle`/`chrome.title` that actually
resolves would pin the tab to the app name — give the owner a title source.

#### Title typography is container-owned

PaneChrome wraps the title region — string **or** node — in the canonical
`<Text variant="label">` baseline (see `pane-chrome.tsx`). A title node
therefore inherits the pane-title size and **must not set its own typography
size** — per-segment weight/color (e.g. a breadcrumb's `font-medium`/muted)
still composes on top, but the *size* comes from the container.

Enforced by `lint/no-adhoc-pane-title` (an inline `<Text variant>` inside a
`PaneChrome title={…}` node); raw `text-*`/`leading-*` is already banned
everywhere by `text/no-adhoc-typography`.

### `PaneScroll` — the sanctioned pane-body scroll viewport

`PaneScroll` is the single sanctioned pane-body vertical scroll viewport — a
dead-thin `<Scroll axis="y" fill h-full>`. The mental model is: **a pane body is
exactly one `PaneScroll`; every header inside it is a `<Sticky>`** (from
`@plugins/primitives/plugins/css/plugins/sticky/web`), so toolbars and section
headers pin against this one viewport instead of each owning a nested scroller.

`PaneChrome` always routes its body through `PaneScroll`, so pane bodies get the
one sanctioned scroll for free and **should not add `overflow-*` on their root**:

- **Simple content** → do nothing. PaneChrome scrolls.
- **Header + scrollable body** → root is `flex h-full flex-col`; the inner
  scrollable region is a `<PaneScroll>` (not a re-derived
  `overflow-y-auto min-h-0 flex-1`). PaneChrome's scroll is naturally inert
  (`h-full` fills it exactly).
- **Custom viewport** (terminal, canvas) → root is `h-full`;
  `overflow-hidden` on root is acceptable as a defensive measure.

`PaneScroll` forwards `ref` (for a host that needs the scroll-container element,
e.g. an `IntersectionObserver` root) and the rest of `Scroll`'s surface
(`hideScrollbar`, `isolate`, `as`, `className`).

### `overlay` — widgets that float over the body

Chrome that must NOT scroll with the document (an outline rail, a progress card)
goes in `<PaneChrome overlay={…}>`, which renders it as a sibling of the single
`PaneScroll` inside a `relative isolate` host. Do **not** wrap `PaneChrome` in
your own `relative` host instead: that host spans the header too, so a
corner-pinned overlay lands on the header's own right-hand actions.

### Actions

Each pane auto-creates an `Actions` slot other plugins contribute to
(`taskDetailPane.Actions({ id, component, position })`). `position` defaults to
`"right"` (the growing part of the header, with the rest of the toolbar);
`"left"` sits immediately after the title — for status chips or context badges.

**`id` is required and must be stable for the contribution's whole life** —
short kebab-case naming the action (`"improve"`, `"view-mode"`). It keys the
[`AdaptiveBar`](../adaptive-bar/CLAUDE.md) width ledger and DOM move plan below,
so an id that churns per render throws every measurement away each frame.

For the common ghost-icon-button case, use the shared `<PaneIconAction label
icon onClick>`; it forwards refs so it composes with components that need a
button ref. (Base UI Popover triggers don't take `asChild` — use
`<PopoverTrigger className={buttonVariants({variant:"ghost",size:"icon"})}>`
directly when the trigger needs to be a popover.)

#### When the header runs out of room

The right-side actions are the `AdaptiveBar` occupants of the header row: each is
asked for a smaller form of itself, and whatever still does not fit is **moved** —
the same live element, never a second copy — into a panel behind a `⋯`.
`PaneChrome`'s `actions` prop is one more occupant, id `pane-extra`.

`PaneActionsSlot` wraps every contribution in an `AdaptiveBar.Item`
unconditionally; the item is transparent with no bar above it, so `"left"` is
unaffected. The bar's own limits apply to what you contribute — no
`position: sticky` inside an action, and an action holding an `<iframe>` refuses
to relocate. `chrome.header` (below) is a different header and collapses nothing.

### Hiding the close / promote buttons

- `chrome: { close: false }` — when close has no meaningful destination (the
  pane navigates elsewhere on close, or its parent isn't a "back" target).
- `chrome: { promote: false }` — for compact side-panels with their own expand
  action (e.g. a button that opens the full detail pane as root).

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

export const myPane = Pane.define({ …, chrome: { header: MyToolbar } });

// the body renders directly under <PaneChrome pane={myPane}> — NO header in it.
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
3. Emits a push/replace **intent** — `{ url, state, mode }` — through the
   installed **`HistoryAdapter`** (`history-sink.ts`). The pane store never
   touches `window.history` itself. `state` is the serialized route (paneId,
   params, options per slot — never the `hint`, which is in-memory only) or
   `{ pending }` for an unresolved URL.

### The `HistoryAdapter` seam

The browser URL + `history.state` are a pure **projection** of the store, and
the store writes that projection only through an adapter, so the pane primitive
stays app-agnostic:

- **`commit(change)`** writes the URL + history entry and announces
  `shell:navigate` (never a synthetic `popstate`).
- **`restore()`** runs on a REAL browser back/forward — the single module-level
  `popstate` listener is its only caller — and rebuilds the in-memory state.

Programmatic navigation ⇒ `shell:navigate`; browser traversal ⇒ `popstate`. A
hard event contract, not idempotency-by-comparison. The adapter lives in an
[`install-sink`](../install-sink/CLAUDE.md) filled with the
**`defaultHistoryAdapter`** (standalone / tests), which writes the route
verbatim and restores it straight back into the live store via
`handleLocationChange()` — so the slot is never empty and teardown never has to
remember the default (`setHistoryAdapter` returns the disposer that restores
it). The **tabs layer installs an app-aware adapter** that widens
every entry into a complete SNAPSHOT of what the user was looking at —
`{ tabId, appId, appInstance, route | pending }` — and restores it whole
(refocus the tab, re-sync its app, restore the route) with zero URL parsing. See
the tabs `CLAUDE.md` for the snapshot model.

`appInstance` (from `primitives/app-instance`) names one running SPA app-state,
of which a single browser tab hosts a sequence — so an entry says not just which
tab it belonged to but which instance that tab id is meaningful in, letting a
cold boot tell "restore the state this entry belongs to" from "this entry came
from somewhere else". None of it reaches the primitive:
`handleLocationChange` reads only `route`/`pending` and ignores the extra keys,
so the pane store never learns about tabs.

URL parsing (`parseUrl`) is only a fallback for initial page load, shared deep
links, and legacy history entries with no snapshot.

### The address bar is untrusted input

Every read of the browser's route path goes through **`currentRoutePath()`**
(`pane/web`), which canonicalizes `window.location.pathname` via
`normalizeRoutePath()` (`pane/core`): repeated `/` runs collapsed, exactly one
leading `/`. A raw pathname fails twice, in ways that look unrelated:

- **As a history URL** it is *scheme-relative*. `replaceState(s, "",
  "//agents/c/x")` resolves against the document to `http://agents/c/x` — a
  different origin — and throws `SecurityError`. That is a hard boot crash on a
  deep link with a doubled slash.
- **As a match key** it silently misses: `"//agents/c/x".startsWith("/agents/")`
  is false, so the URL owns no app and the deep link falls back to the default
  app.

Because the canonical path is also what the boot replace-stamp commits, a
slash-mangled deep link **self-heals** — the address bar is rewritten in place
to the working URL. `pane/no-raw-location-path` keeps `currentRoutePath()` the
only reader (tests and `e2e/` are exempt; the reader itself and web-core's
pre-boot prefix match carry per-site disables).

The shell mounts a layout renderer once (`<MillerColumns/>` from
`@plugins/layouts/plugins/miller/web`, or `<FullPane/>`), which reads the route
via `useRoute()`. The router rebuilds its lookup table from the `Pane.Register`
contribution list synchronously on every render via `useSyncPaneRegistry()`.

## Testing

The jsdom suites live in `web/__tests__/` and run via `bun run test:dom
plugins/primitives/plugins/pane` (manual — nothing runs them automatically).

**Mount a pane surface with `TestSurface` from `./surface-fixture`; never
hand-pick the contexts your component happens to need.** The fixture wraps the
real `PaneSurfaceProvider`, so a context that moves into the surface reaches
every suite at once:

```tsx
import { createTestSurfaceStore, TestSurface } from "./surface-fixture";

const store = createTestSurfaceStore();   // in beforeEach
render(<TestSurface store={store} plugins={[testPlugin]}><ComponentUnderTest /></TestSurface>);
```

Two rules the fixture encodes, both of which have bitten:

- **A store is not optional.** `PaneStoreContext` has no default (see
  `usePaneStore`), so anything reaching a route hook — including a pane's
  Loading / Not-Found chrome, via `useClose()`/`usePromote()` — throws without a
  surface above it.
- **`live: true` for anything URL-derived.** `handleLocationChange` early-returns
  for a background store, so a `live: false` store never reads
  `window.location` and every deep-link case resolves empty. Conversely, pass
  `createTestSurfaceStore({ live: false })` when the suite restores a route by
  hand and must not have it re-parsed away from the URL.

Suites that only drive a `PaneStore` object (`pane-isolation`, `history-sink`)
need no surface at all — the fixture adds nothing there.

## A pane's home app, and what Expand means

`Pane.define({ app })` names the app a pane **belongs to** — not wherever it is
being rendered. Panes are reusable chrome: the agent manager hosts the page
detail beside a conversation, and Pages could host a conversation the same way.

Expand (the `MdOpenInFull` button in `PaneChrome`, `usePromote()`) reads it and
picks one of two destinations:

- **hosted by another app** → hand the pane's app-rooted URL to the tab manager,
  so it lands in its own app with that app's whole surface around it. Offered
  even at route position 0 — `/agents/page/X` is a page stranded in the agent
  manager, which is precisely the case worth fixing. The button says where it
  is about to send you: **"Open in Pages"**.
- **hosted by its own app** → the original behavior: drop the ancestors and
  re-root the route here. Only meaningful below the root. The button says
  **"Expand pane"**, because there is no other app to name.

So `usePromote()` returns the destination, not just a way to get there: a
discriminated `PromoteAction` (`{ kind: "cross-app"; app; run }` /
`{ kind: "re-root"; run }`) the chrome labels itself from. `null` still means
"nowhere to go" and paints no button.

**`app` is mandatory, with no opt-out** — being displayable in any app is a fact
about hosting, not an absence of ownership. The case that looks like an
exception isn't: the theme customizer restyles whichever app you are in, and its
home is still `settingsApp`, because Appearance is a Settings surface.

Write it right after the identity field (`id:` / `route:`), importing the
`AppRef` from the app shell's **core** barrel
(`@plugins/apps/plugins/<app>/plugins/shell/core` — a leaf holding only
`defineApp({...})`, so it can never close an import cycle). Test fixtures
`defineApp` a local app instead, keeping this primitive's suites free of any
dependency on `plugins/apps`.

`AppRef.name` ("Pages", "Agent manager") is the **single** authoring site for an
app's display name — the rail tooltip, a tab's fallback title and Expand all
read it, so none of them restates it.

Cross-app Expand additionally needs a route-backed pane (a legacy segment pane
has no `RouteDef`, so there is no URL to build) and an installed navigator;
missing either degrades silently to the same-app branch.

**Why a sink for the navigation.** `apps-core/tabs` imports this primitive, so
this primitive cannot import it back. Tabs installs its `navigate` into
`appNavSink` (`app-nav-sink.ts`) at provider mount, exactly as it installs its
history adapter — the pane layer calls a cross-app destination without knowing
tabs exists.

Both are [`install-sink`](../install-sink/CLAUDE.md) sinks, which decides how
you read them: `appNavSink.useInstalled()` from a render path (subscribed, so a
late install re-renders whoever asked early), `peek…` only from an event handler
or an effect.

### The app's index pane (`appIndex`)

One pane per app is its **landing pane** — what the app's bare root shows when
there is no route yet (`/mail`, `/pages`, `/agents`). It says so with a boolean:

```ts
export const mailRootPane = Pane.define({
  id: "mail-root",
  app: mailApp,
  appIndex: true,     // ← bare `/mail` resolves here
  component: MailRoot,
});
```

A boolean, not a path: *which* app's root is `app.basePath`, which the pane
already carries. Leave `segment` off — an index pane is reached at the app's
base path and has no URL of its own. Registry sync throws on a segment-bearing
index pane and on a second index for one app.

There is **no global fallback**: an app with no index pane shows an empty main
area at its bare root, which is a legitimate choice (`home`, `studio`).
`useIndexMatch(basePath)` resolves it; the main-area renderer paints it only for
a genuinely empty route, and overlay hosts ignore it.

## Not yet implemented (deferred)

- `keepalive` for heavy panes — switching slots remounts by default.
- Layout tree (drag-and-drop, tabs, overlays).

See "Open questions" in the design doc.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Unified pane primitive: Pane.define and chrome components.
- Load-bearing: yes
- Web:
  - Slots: `Pane.Register` ← `active-data.plugin-link`, `apps.agent-manager.welcome`, `apps.deploy.deployments`, `apps.deploy.servers`, `apps.events.event-list`, `apps.events.shell`, `apps.events.sources`, `apps.events.sources.source-detail.runs`, `apps.mail.reading-pane`, `apps.mail.search`, `apps.mail.shell`, `apps.mail.threads`, `apps.pages.page-tree`, `apps.pages.welcome`, `apps.prototypes.gallery`, `apps.settings.accounts`, `apps.settings.config`, `apps.sonata.library`, `apps.story.shell`, `apps.studio.compositions`, `apps.studio.compositions.release`, `apps.studio.contributions`, `apps.studio.contributions.tables`, `apps.studio.explorer`, `apps.studio.graph`, `apps.website.downloads`, `apps.website.pillars.agents`, `apps.website.pillars.apps`, `apps.website.pillars.platform`, `apps.website.shell`, `apps.workflows.definitions`, `apps.workflows.executions`, `auth.apple-signing.setup-wizard`, `auth.google-maps.setup-wizard`, `auth.google.setup-wizard`, `backup`, `build`, `code-explorer`, `code-explorer.commit-detail`, `config_v2.settings`, `conversations.agents`, `conversations.all-conversations`, `conversations.conversation-view`, `conversations.conversation-view.code.docs-button`, `conversations.conversation-view.code.file-pane`, `conversations.conversation-view.commits-graph`, `conversations.conversation-view.jsonl-viewer.tool-call.agent`, `conversations.conversation-view.jsonl-viewer.tool-call.workflow`, `conversations.conversation-view.push-profiling`, `conversations.conversation-view.terminal-pane`, `conversations.recover`, `conversations.summary`, `debug.boot-profile`, `debug.broadcasts`, `debug.claude-cli-calls`, `debug.config-orphans`, `debug.health-monitor`, `debug.heap-snapshot`, `debug.live-state-churn.emit`, `debug.live-state-health`, `debug.logs`, `debug.memory`, `debug.profiling`, `debug.profiling.build`, `debug.profiling.ops`, `debug.queue`, `debug.read-set`, `debug.render-profiler`, `debug.reports`, `debug.trace.pane`, `debug.worktree-cleanup`, `debug.zero-test`, `infra.events-test`, `plugin-meta.plugin-view`, `primitives.css.layout-harness`, `review`, `screenshot`, `stats`, `tasks.attempt-view`, `tasks.task-detail`, `ui.theme-engine.theme-customizer`
  - Uses:
    - `primitives/adaptive-bar.AdaptiveBar`
    - `primitives/bar.Bar`
    - `primitives/css/center.Center`
    - `primitives/css/column.Column`
    - `primitives/css/fill.Fill`
    - `primitives/css/placeholder.Placeholder`
    - `primitives/css/scroll.Scroll`
    - `primitives/css/scroll.ScrollProps`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.ControlSize`
    - `primitives/css/ui-kit.SingleLineProvider`
    - `primitives/css/yield.yieldClass`
    - `primitives/icon-button.IconButton`
    - `primitives/install-sink.defineInstallSink`
    - `primitives/latest-ref.useLatestRef`
    - `primitives/link-gesture.linkGestureProps`
    - `primitives/loading.Loading`
    - `primitives/select-scope.ContentScope`
    - `primitives/slot-render.defineRenderSlot`
    - `primitives/slot-render.renderIsolated`
    - `primitives/slot-render.RenderSlot`
    - `primitives/surface-id.SurfaceIdContext`
    - `primitives/tooltip.WithTooltip`
  - Exports (types):
    - `AnyPane`
    - `AppNavigator`
    - `Hint`
    - `HistoryAdapter`
    - `InferParams`
    - `LocationChange`
    - `MatchEntry`
    - `OpenPaneFn`
    - `PaneActionContribution`
    - `PaneChromeConfig`
    - `PaneHeaderZones`
    - `PaneHistoryState`
    - `PaneInternal`
    - `PaneMatch`
    - `PaneObject`
    - `PaneOpenMode`
    - `PaneOptions`
    - `PaneRouteEntry`
    - `PaneScrollProps`
    - `PaneSlot`
    - `PaneStore`
    - `PaneToggleOpts`
    - `PaneToolbarItem`
    - `ParsedRoute`
    - `PromoteAction`
    - `ResolveHook`
    - `RouteState`
    - `SerializedSlot`
    - `SurfaceChrome`
    - `TypeMarker`
  - Exports (values):
    - `appNavSink`
    - `buildRouteUrl`
    - `clearRoute`
    - `createPaneStore`
    - `currentRoutePath`
    - `defaultHistoryAdapter`
    - `defaultStore`
    - `openPane`
    - `Pane`
    - `PaneActionsSlot`
    - `PaneBasePathContext`
    - `PaneChrome`
    - `PaneIconAction`
    - `PaneInstanceContext`
    - `PaneLayoutContext`
    - `PaneLoadScopeContext`
    - `PaneMatchContext`
    - `paneOwnerFor`
    - `PaneResolveGuard`
    - `PaneScroll`
    - `PaneStoreContext`
    - `PaneSurfaceAppContext`
    - `PaneSurfaceProvider`
    - `parseUrl`
    - `peekBasePath`
    - `peekRoute`
    - `reorderRoute`
    - `restoreRoute`
    - `setBasePath`
    - `setHistoryAdapter`
    - `setLiveStore`
    - `stripBasePath`
    - `SurfaceChromeContext`
    - `ToolbarItem`
    - `type`
    - `useCurrentPane`
    - `useIndexMatch`
    - `useOpenPane`
    - `usePaneMatch`
    - `usePaneRoute`
    - `usePaneStore`
    - `usePaneTitle`
    - `usePathname`
    - `useRenderSync`
    - `useRoute`
    - `useRouteState`
    - `useSurfaceAppId`
    - `useSyncPaneRegistry`
- Cross-plugin:
  - Imported by:
    - `active-data/attempt`
    - `active-data/commit-link`
    - `active-data/conv`
    - `active-data/page-link`
    - `active-data/plugin-link`
    - `active-data/task`
    - `active-data/task-link`
    - `apps-core`
    - `apps-core/layout`
    - `apps-core/tab-surface`
    - `apps-core/tabs`
    - `apps/agent-manager/shell`
    - `apps/agent-manager/welcome`
    - `apps/browser/shell`
    - `apps/debug/shell`
    - `apps/deploy/deployments`
    - `apps/deploy/servers`
    - `apps/deploy/shell`
    - `apps/events/event-list`
    - `apps/events/shell`
    - `apps/events/sources`
    - `apps/events/sources/source-detail/runs`
    - `apps/file-explorer/shell`
    - `apps/home/shell`
    - `apps/mail/reading-pane`
    - `apps/mail/search`
    - `apps/mail/shell`
    - `apps/mail/threads`
    - `apps/pages/content-search`
    - `apps/pages/page-tree`
    - `apps/pages/prompt-origin`
    - `apps/pages/shell`
    - `apps/pages/welcome`
    - `apps/pages/welcome/quick-create`
    - `apps/pages/welcome/recent-pages`
    - `apps/prototypes/gallery`
    - `apps/prototypes/shell`
    - `apps/settings/accounts`
    - `apps/settings/appearance`
    - `apps/settings/config`
    - `apps/settings/shell`
    - `apps/sonata/library`
    - `apps/sonata/shell`
    - `apps/story/shell`
    - `apps/studio/compositions`
    - `apps/studio/compositions/closure-tree`
    - `apps/studio/compositions/draft-actions`
    - `apps/studio/compositions/release`
    - `apps/studio/contributions`
    - `apps/studio/contributions/tables`
    - `apps/studio/explorer`
    - `apps/studio/explorer/membership`
    - `apps/studio/graph`
    - `apps/studio/shell`
    - `apps/website/demos/plugin-pyramid`
    - `apps/website/demos/release-switcher`
    - `apps/website/downloads`
    - `apps/website/landing/cta`
    - `apps/website/landing/pillars`
    - `apps/website/pillars/agents`
    - `apps/website/pillars/apps`
    - `apps/website/pillars/platform`
    - `apps/website/shell`
    - `apps/workflows/definitions`
    - `apps/workflows/executions`
    - `apps/workflows/shell`
    - `auth`
    - `auth/apple-signing/setup-wizard`
    - `auth/google`
    - `auth/google-maps/setup-wizard`
    - `auth/google/setup-wizard`
    - `backup`
    - `build`
    - `code-explorer`
    - `code-explorer/commit-detail`
    - `config_v2/settings`
    - `conversations`
    - `conversations/agents`
    - `conversations/all-conversations`
    - `conversations/conversation-view`
    - `conversations/conversation-view/code/docs-button`
    - `conversations/conversation-view/code/file-pane`
    - `conversations/conversation-view/commits-graph`
    - `conversations/conversation-view/jsonl-viewer/file-path`
    - `conversations/conversation-view/jsonl-viewer/tool-call/add-task`
    - `conversations/conversation-view/jsonl-viewer/tool-call/agent`
    - `conversations/conversation-view/jsonl-viewer/tool-call/page-tools`
    - `conversations/conversation-view/jsonl-viewer/tool-call/skill`
    - `conversations/conversation-view/jsonl-viewer/tool-call/workflow`
    - `conversations/conversation-view/markdown-extensions`
    - `conversations/conversation-view/open-app`
    - `conversations/conversation-view/push-profiling`
    - `conversations/conversation-view/terminal-pane`
    - `conversations/conversation-view/vscode`
    - `conversations/conversations-view`
    - `conversations/pane-restore`
    - `conversations/recover`
    - `conversations/summary`
    - `debug/boot-profile`
    - `debug/broadcasts`
    - `debug/claude-cli-calls`
    - `debug/config-orphans`
    - `debug/health-monitor`
    - `debug/heap-snapshot`
    - `debug/live-state-churn/emit`
    - `debug/live-state-health`
    - `debug/logs`
    - `debug/memory`
    - `debug/profiling`
    - `debug/profiling/build`
    - `debug/profiling/ops`
    - `debug/queue`
    - `debug/read-set`
    - `debug/render-profiler`
    - `debug/reports`
    - `debug/slow-ops`
    - `debug/timeline`
    - `debug/trace/engine`
    - `debug/trace/pane`
    - `debug/worktree-cleanup`
    - `debug/zero-test`
    - `infra/events-test`
    - `integrations/google-maps`
    - `layouts/full-pane`
    - `layouts/host`
    - `layouts/miller`
    - `layouts/route-fallback`
    - `page/annotations/agent-notes/authorship`
    - `page/annotations/todo/task-link`
    - `page/prompt/block`
    - `plugin-meta/contributions-table`
    - `plugin-meta/plugin-view`
    - `plugin-meta/plugin-view/dependencies`
    - `plugin-meta/plugin-view/file-tree`
    - `plugin-meta/plugin-view/sub-plugins`
    - `primitives/app-shell`
    - `primitives/css/layout-harness`
    - `primitives/launch`
    - `primitives/pane-toolbar`
    - `reports`
    - `review`
    - `screenshot`
    - `stats`
    - `stats/cost`
    - `tasks/attempt-view`
    - `tasks/task-dependencies`
    - `tasks/task-deps-tree`
    - `tasks/task-detail`
    - `tasks/task-events`
    - `tasks/task-graph`
    - `tasks/task-header`
    - `tasks/tasks-core`
    - `ui/theme-engine/theme-customizer`
- Core:
  - Exports (types):
    - `AppRef`
    - `InferParams`
    - `RouteDef`
  - Exports (values):
    - `defineApp`
    - `defineRoute`
    - `fillSegment`
    - `normalizeRoutePath`
    - `normalizeSegmentPattern`

<!-- AUTOGENERATED:END -->
