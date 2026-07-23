# Tab title reflects the main surface, not the leaf pane (`titleOwner`)

**Date:** 2026-07-23
**Status:** Implemented
**Scope:** `primitives/pane`, `apps-core/tab-surface`, annotations on entity panes

## Problem

The tab label and browser `document.title` were resolved against the route's
**leaf** pane (`panes.at(-1)`) — i.e. "whatever was opened last". That is wrong
whenever the last-opened pane is an auxiliary tool rather than the page's
identity:

- `conv / file-peek` (deep link to a file in a conversation) → the file pane
  had no title, so the tab fell back to the bare app name "Agent Manager".
- `conv / review`, `conv / terminal`, `conv / commits` → same failure shape:
  the aux pane steals (or clears) the title the conversation should own.

Patching a title onto each aux pane (the first attempted fix: a `chrome.title`
on file-peek) treats the symptom — the tab would then show the *file* name,
still not the page's identity, and every future aux pane re-introduces the bug.

## Model

A route mixes three kinds of panes:

- **Navigation** — lists/trees you select from (task list, attempt's
  conversation list). Never the page identity.
- **Main surface** — the entity the page is about (the conversation in the
  agents app, the task in the tasks app, the page in Pages, the song in
  Sonata).
- **Auxiliary** — tools opened off the main surface (file peek, review, tmux,
  commits graph). Context, not identity.

The title rule: **the tab/document title resolves against the FIRST pane in
the route that declares itself a main surface.** First-owner-wins is what
makes the same pane correctly primary in one app and correctly subordinate in
another, with a single static declaration and no per-app context:

- `attempt / conv / …aux` → conv (attempt pane is navigation)
- `tasks-root / task-detail / conv` → task (the conv opened under a task is a
  drill-in; the page is still about the task)

Switching the selected conversation swaps the conv pane's params, so the title
follows the selection by construction, regardless of aux panes to its right.

## Abstraction

`Pane.define({ titleOwner: true })` — a boolean on the pane definition, stored
on `PaneInternal`. The tab surface's `TabTitleReporter` picks:

```ts
const leaf = panes.find((p) => p.pane.titleOwner) ?? panes.at(-1);
```

Everything downstream is unchanged: the keyed `LeafTitleReporter`,
`usePaneTitle` (`useTitle` hook → `chrome.title` fallback), the tabs store,
`DocumentTitleSync`, the index-pane fallback at bare app roots.

### Why opt-in (default `false`)

- Unannotated routes keep today's leaf behavior — debug/settings/single-pane
  apps are unaffected; incremental adoption.
- Fails safe: forgetting to annotate a new main pane degrades to the status
  quo. The rejected opt-*out* design (aux panes declare `tabTitle: false`,
  last-owner-wins) re-introduces the bug on every forgotten peek pane, and
  gets `task-detail / conv` wrong (conv would win).

### Rejected alternatives

- **Per-app main-pane list** (like `layouts/host`'s full-surface list):
  duplicates knowledge the pane has about itself; first-owner-wins shows the
  role is intrinsic, not per-app.
- **Numeric title priority:** no case needs more than owner/not-owner; the
  boolean can grow into a `role` enum when a second consumer of "main
  surface" semantics actually exists (promote targeting, pane-restore
  anchoring, …).

## Annotated panes (initial set)

| Pane | Title source |
| --- | --- |
| `conversationPane` | existing `useTitle` (conversation name) |
| `taskDetailPane` | **new** `useTitle` via `useTask` (was: none — a title owner without a title source would pin the tab to the app name) |
| `pageDetailPane` | existing `useTitle` |
| `sonataPlayerPane` | existing `useTitle` + hint |
| `compositionDetailPane` | existing `useTitle` |

Aux panes (file-peek, review, terminal, commits-graph, …) and navigation panes
(tasks-root, attempt list, compositions list) stay unannotated. The file-peek
pane keeps its `chrome.title` (file basename) as its own header/fallback — it
only reaches the tab when a route has no title owner.
