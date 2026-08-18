# A row that generates no box has no width — the adaptive bar's `no-slack` false positive

Status: plan (2026-08-18)

## Context

`Debug → Reports` has been carrying an `adaptive-bar` / `no-slack` report against
a real production surface since 2026-08-17: origin
`conversations.conversation-view.prompt-templates@prompt-editor.floating-action`,
the pinned prompt-template chips in the conversation prompt bar, seen 11 times,
last at 2026-08-18 10:30. A second copy of the same fingerprint arrived at
13:00 today.

`no-slack` is the guard that says the bar's host is lying about the width it
hands the bar. Its remedy latches for the rest of the mount: everything back in
the row, CSS clips, and the bar never decides again. So while it fires, the
overflow behaviour the primitive exists to provide is switched off on that
surface — and a report that is not a real defect trains everyone to ignore the
one that is.

The task that opened this described it as the shrink-wrap fault. It is not. The
evidence says two different things are happening, and only one of them is a
host bug.

## What the reports actually say

`no-slack` has **two** trip points in `reconcile`
(`plugins/primitives/plugins/adaptive-bar/web/internal/adaptive-bar.tsx`):

- **A — the 0px branch** (~line 753): `available <= 0` with occupants already
  relocated out of the row. Message: *"the row measured 0px wide while occupants
  were relocated out of it…"*.
- **B — the differential probe** (~line 781): `widthFollowsContent` hides what
  the row holds, re-reads the row, puts it back. Message: *"the bar's own width
  moves with its own content…"*. This is the direct test of the premise.

Every prompt-templates report carries **message A**. The sonata report carries
**message B**. That distinction is the whole diagnosis.

| # | origin / label | url | branch | verdict |
|---|---|---|---|---|
| 1 | `…prompt-templates@prompt-editor.floating-action` (×11) | `/home` | A | false positive |
| 2 | same | `/events/list` | A | false positive |
| 3 | `apps.sonata.library@sonata.toolbar.start` — "More displays" | `/sonata/song/…` | B | **real host bug** |
| 4 | label "More", no lineage recorded (pre-dates the `origin` field) | `/prototypes/proto/control-panel-pickers` | A | false positive |
| 5 | label "More actions", no lineage | `/prototypes/proto/control-panel-vocabulary` | A | false positive |

### Why 1 and 2 are false positives

The report's `url` and its `originPath` disagree. The URL is `/home` (and
`/events/list`); the lineage is
`… > apps.agent-manager.shell@apps.app > … > conversations.conversation-view#pane:conversation > … > prompt-templates@prompt-editor.floating-action`.
The bar was in the **agent-manager tab while a different tab was focused**.

That inference is airtight because the URL is read synchronously at fault time
(`plugins/reports/plugins/adaptive-bar/web/components/adaptive-bar-collector.tsx`:
`url: window.location.href`, inside the sink handler `failLoudly` calls from
inside `reconcile`), and only the focused tab mirrors its route to the URL.
There is no lag and no async window. The technique generalises to every
client-side report kind: **when a report's URL and its lineage name different
apps, the reporter was not on screen.**

Keeping a surface mounted but not rendered is this app's general contract, and
it has **four** spellings, all of them `display: none`:

| where | when |
|---|---|
| `apps-core/plugins/surface/web/components/surface-body.tsx:339` | any unfocused tab in the docked / solo placements (the live path) |
| `apps-core/plugins/tab-surface/web/components/app-tabs-body.tsx` | the keep-alive fallback body |
| `apps-core/plugins/surface/plugins/floating/web/floating-placement.tsx:137` | a minimized floating window, or one on another virtual desktop |
| `layouts/plugins/miller/web/components/column.tsx:94` | a collapsed but kept-mounted miller column |

Everything inside a `display: none` subtree measures 0px. The conversation tab
had already evicted a chip while it was visible (`overflow="clip"`), so the
hide itself is what files the fault: `getComputedStyle` still answers for a
non-rendered element, so `readRowMetrics` succeeds, `measure(root)` returns 0,
and `available <= 0 && evicted.length > 0` latches. The trigger is the
`ResizeObserver` — every engine delivers a 0×0 observation on the transition to
`display: none`, and the RAF debounce still runs because the *document* is
visible. An ordinary re-render is **not** enough: in production `reconcile`'s
identity is stable across re-renders, which is exactly why the jsdom suite
passes a fresh `measure` arrow per render.

`degraded` latches per mount, so a count of 11 is 11 hide transitions.

Reports 4 and 5 are the same story from before the `origin` field existed:
"More" is the prompt-templates bar's default label and "More actions" is
`PaneChrome`'s — two ordinary bars sitting in backgrounded tabs (or collapsed
columns) while the user browsed the prototypes route. **Nothing is wrong with
either prototype**, and per `prototypes/CLAUDE.md` their folders are not opened.

The prompt-templates chain itself is clean, and was made clean deliberately in
commit `5b29f7d61`: the contribution declares `fill: true`, `prompt-editor`'s
`ToolbarRow` relays it through `<Fill>`, `slot-render`'s `SlotItemCell` emits
`flex min-w-0 flex-1 items-center`, and every box up to `EditorShell`'s `w-full`
relays grow. A genuinely shrink-wrapping host would also trip **branch B on its
very first pass** — at mount every occupant is inline, so the probe runs and
answers immediately, long before an eviction could produce a 0px row. Branch B
never fired here.

### Why 3 is real

`plugins/apps/plugins/sonata/plugins/library/web/components/player-toolbar-items.tsx`:

```tsx
// `w-full` gives the row a defined width to overflow against; …
<Stack direction="row" align="center" gap="sm" className="w-full">
```

contributed in `…/library/web/index.ts` as
`SonataToolbar.Start({ id: "display-picker", component: DisplayPicker })` — with
**no `fill: true`**. Its `SlotItemCell` is therefore `flex min-w-0 items-center`
(no `flex-1`), so it shrink-wraps, and `w-full` resolves against a
shrink-to-content box. The comment is exactly the misunderstanding the guard
exists to catch, and the guard caught it.

## The root cause, stated once

`reconcile` reads the row's width and treats `0` as a width. It is not: an
element that generates **no box** has no width to have been given. That is a
different fact from a rendered box that measures zero, and the repo already
knows it — the layout harness itself skips non-participants for exactly this
reason (`plugins/primitives/plugins/css/plugins/layout-harness/web/internal/entry.tsx`):

> An element that generates NO BOXES is not a geometry participant, and
> measuring it invents one.

A `0` standing in for "there is no answer" is an absorbable failure value, which
this codebase bans by policy (root `CLAUDE.md`, *Failure must be a type, not an
absorbable value*). The bar absorbs it, concludes its host is lying, and latches
a degraded layout for the life of the mount — the most expensive act this
primitive can take.

## The fix

### 1. The primitive: rendered-ness is part of the measurement seam

`plugins/primitives/plugins/adaptive-bar/web/internal/measure.tsx`

The context currently carries a bare `MeasureWidth`. Make it carry a bundle:

```ts
export type IsRendered = (el: Element) => boolean;

interface MeasureBundle {
  measure: MeasureWidth;
  /** Does this element generate a box at all? */
  isRendered: IsRendered;
}
```

- Production default (a module-level frozen bundle `DOM_MEASURE`): `measure`
  unchanged, `isRendered: (el) => el.getClientRects().length > 0`. A
  `display: none` element returns an empty list; a rendered `display: flex` row
  of zero width still returns one rect — which is precisely the distinction
  wanted.
- `AdaptiveBarMeasure` (test-only) gains an optional `isRendered`, defaulting to
  a **module-level** `() => true` — jsdom returns `[]` from `getClientRects()`
  for everything, so a supplied-width test must count as rendered.
- Memoize the bundle on `[measure, isRendered]`, and no more. That preserves
  today's semantics in both directions: `no-slack.test.tsx`'s `LateOnsetRow`
  passes a fresh arrow per render, so the deps move, `reconcile`'s identity
  moves and the pass re-runs; `row-inset.test.tsx` and `termination.test.tsx`
  pass stable functions and keep their stable context value, which
  `termination.test.tsx` depends on because it counts faults against
  `MAX_SURRENDERS`.
- `useLayoutMeasured()` keeps working by comparing the context value against
  `DOM_MEASURE`.
- `useMeasureWidth()` becomes `useMeasureBundle()` — one context read for two
  values read for the same decision, the same argument `readRowMetrics` makes
  for bundling gap and inset. Both call sites are inside `adaptive-bar.tsx`.

The predicate must go through the seam rather than being called directly:
**no existing test reaches branch A at all** (both no-slack suites trip
branch B), and jsdom returns `[]` for everything — a direct `getClientRects()`
call would make branch A permanently dead in jsdom and silently un-testable,
quietly changing the semantics of a guard the primitive's docs describe as "not
gated at all".

`web/internal/adaptive-bar.tsx`, branch A:

```ts
if (available <= 0) {
  // A row that generates no box has no width to have been given — a
  // display:none keep-alive tab, a minimized window, a collapsed miller
  // column. That is a pause at whatever placement the bar last committed, not
  // a fault, and above all not a latch: the bar decides again the moment it is
  // shown.
  //
  // A row that IS rendered and still measures nothing, with occupants parked
  // outside it, is a width its host really gave it, and stays a fault.
  if (evicted.length > 0 && isRendered(root)) { … existing fault … }
  return;
}
```

`isRendered` is called only when the width already read as zero and something is
evicted, so the happy path costs nothing and no extra reflow is forced —
`measure(root)` has already flushed layout.

`getClientRects().length` is also already this file's own spelling for the
question: `measureRowOverflow` (~line 1666) uses it to mean "generates no
boxes". A second spelling for one question is the drift this primitive's own
docs spend paragraphs preventing. It also beats the alternatives: `offsetParent`
is an ancestor comparison the file bans in bold and is `null` for the
`fixed`-positioned solo placement; `checkVisibility()` is newer than the WebKit
`tauri/` ships and folds in `content-visibility`, which is the wrong answer
because such an element still has a real width from its host. `visibility:
hidden` deliberately still faults, for the same reason.

The message must be reworded too. It currently asserts *"the only width the bar
can read is the one its own evictions produced"*, which is true of the ratchet
and false of the other way a rendered row reaches zero — see follow-up 1.

### 2. The sonata host

- `plugins/apps/plugins/sonata/plugins/library/web/index.ts` — add `fill: true`
  to the `display-picker` contribution.
- `plugins/apps/plugins/sonata/plugins/library/web/components/player-toolbar-items.tsx`
  — drop `className="w-full"` and its comment; wrap the `Stack` in `<Fill>`
  (`@plugins/primitives/plugins/css/plugins/fill/web`), the grow relay inside
  the now-`flex-1` cell. `w-full` was not merely redundant: it leaves
  `min-width: auto`, so the Stack could not shrink below its min-content and
  would overflow a narrow header; `Fill` is `min-w-0 flex-1`, which grows *and*
  shrinks.
- Same file: the "Display" eyebrow is a hand-rolled copy of
  `Text variant="eyebrow"`. Replace it with
  `<SectionLabel className={rigidClass()}>` — `SectionLabel` already carries
  `whitespace-nowrap`, and `rigidClass()` is a call rather than a literal, so
  `no-adhoc-layout` does not fire.

`PaneChrome`'s `CustomHeader` renders `Start.Render` items as direct flex
children of the header `<Bar>` and puts the `End` zone behind `ml-auto`. Auto
margins absorb *remaining* free space after flexible lengths resolve, so a
growing Start cell consumes the space `ml-auto` would otherwise take and the End
cluster lands at exactly the same x. Only three `SonataToolbar.Start`
contributions exist and none declares `fill` today, so this creates exactly one
grow cell.

## What is deliberately not done

- **No geometry-gate fixture.** Three independent reasons: the harness's
  mutations are synchronous one-shot style writes with no restore phase; the
  bar's resize callback is RAF-debounced, so a hide-then-show inside one task
  coalesces to no size change and the hidden pass never runs; and the invariant
  vocabulary is purely geometric, with no "did not degrade" predicate. Browser
  coverage goes in a manual e2e script instead, where real waits exist.
- **No new fault kind.** Branch A and branch B are one fault with one remedy.
- **The second branch-A ambiguity is filed, not fixed** — see follow-up 1.

## Tests and verification

1. **jsdom** — `plugins/primitives/plugins/adaptive-bar/web/__tests__/no-slack.test.tsx`,
   a new `describe` with three cases, on the stateful-measure pattern
   `LateOnsetRow` already uses:
   - a host that is hidden while occupants are relocated out of the row files
     **no** fault — and, the load-bearing half, **still evicts after being shown
     again**, which is what proves the latch did not fire (a test that only
     counted reports would pass against a fix that suppressed the report and
     still called `setDegraded`);
   - a **rendered** row of zero width still faults and still takes the ceiling —
     the negative control that stops a later "simplification" turning the branch
     off;
   - the hidden pass measures no item containers, pinning the early return above
     the measurement loop.
2. **Real browser (manual)** — a new
   `plugins/primitives/plugins/adaptive-bar/e2e/adaptive-bar-hidden-host.ts`, in
   the shape of `adaptive-bar-churn.ts`: point it at any route, discover the
   bars, narrow until one relocates, apply `display: none` to an ancestor (the
   exact mechanism `surface-body.tsx` uses), wait real frames, restore, and
   assert the bar still relocates instead of clipping everything.
3. **End to end in the app** — build, open a conversation with pinned prompt
   templates, narrow the pane until a chip is dropped, switch to another app tab
   and back, then `query_db` this worktree's `reports` table for
   `kind = 'adaptive-bar'`. Before the fix a row appears; after it, none.
4. Repo checks (type-check, lint, layout-geometry).

## Docs

- `plugins/primitives/plugins/adaptive-bar/CLAUDE.md`, the `no-slack` bullet:
  the sentence *"A row that measures 0px while occupants are relocated out of it
  is the same fault"* is now conditional and must say so. Name `getClientRects()`
  as the predicate and say why the distinction is not pedantry: a `0` from an
  unrendered element is an absorbable failure value whose consumer latches
  irreversibly.
- Same file, the jsdom paragraph: record that `no-slack` is still not
  engine-gated, and that `isRendered` defaults to `() => true` in the seam
  precisely so branch A stays drivable from jsdom.
- Same file, "The honest costs": one line that `degraded` latches per mount, so
  a false positive costs the surface until it remounts — the reason this branch
  is held to a higher standard than the others.
- `plugins/reports/plugins/adaptive-bar/CLAUDE.md`: one sentence that a bar in a
  hidden subtree no longer files, so readers of old rows know why the population
  changed.

## Follow-ups worth filing

**1. Branch A cannot tell the ratchet from an over-full row, and latches anyway.**
`flex-1` is `flex: 1 1 0%`. When a row's other items over-fill it, free space is
negative and the `flex-1` cell resolves to exactly **0px while fully rendered** —
so `isRendered` says yes and branch A latches the ceiling for the life of the
mount. Branch B is correctly silent there (hiding the occupants does not change
a width that comes from free space), so the two cases are indistinguishable by
width alone. The sketch: instead of latching, branch A commits the ceiling
*once*, clears `slackVerifiedAtRef` and refunds one probe, which re-admits every
occupant and hands the question to branch B — the guard that can actually answer
it. A shrink-wrap host then faults on the next pass with the right message and
latches; an over-full row finds `evicted.length === 0` and simply pauses,
recovering when the row widens. Needs a bounded recovery counter for
termination, so it is its own change with its own proof.

**2. A render-slot contribution whose component hosts an `AdaptiveBar` must
declare `fill: true`.** Nothing enforces it, and both slot-hosted bars in the
repo have got it wrong once each (prompt-templates, fixed in `5b29f7d61`;
sonata, fixed here). The facet/docgen pipeline already knows each contribution's
component, so a `check` could answer "does this component transitively render an
AdaptiveBar" statically — rung 3 on the fix ladder, where the contract is rung 5
plus a runtime report today.

## What to watch after deploying

Branch-A `no-slack` reports for
`conversations.conversation-view.prompt-templates@prompt-editor.floating-action`
should stop. If any survive, they are follow-up 1 (a `flex: 1 1 0%` cell
resolving to nothing against negative free space), and the remedy is on the host
side — the prompt bar's sibling cells — not in the bar.
