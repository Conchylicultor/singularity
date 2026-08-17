# adaptive-bar

Overflow as **relocation**, not transformation: a bar that runs out of room asks
each widget to render a smaller form of itself, and moves the rest — as
themselves, one live instance, never a second render — into a panel.

Design doc: [`research/2026-08-16-global-adaptive-bar-relocating-overflow.md`](../../../../research/2026-08-16-global-adaptive-bar-relocating-overflow.md).

```tsx
<AdaptiveBar gap="xs" label="More actions">
  <SomeSlot.Render>
    {(item) => <AdaptiveBar.Item id={item.id}><Item {...item} /></AdaptiveBar.Item>}
  </SomeSlot.Render>
</AdaptiveBar>
```

The host names no contributor, declares no priority, hardcodes no width, and
renders no second copy. Every policy comes from the widgets, through
[`action-presentation`](../action-presentation/CLAUDE.md)'s `useActionForm` —
because a bar's occupants come from different plugins and it can name none of
them.

`align` is `"start"` (default) | `"end"` — which end of the bar's own slack the
occupants sit against. It is a prop and not a caller `className` for the same
reason as the rule below: the bar takes ALL the row's slack, so a consumer has no
way to answer "where in it" from outside, and reaching in with a raw `justify-*`
would fight the mechanics the bar owns. A trailing action cluster (a pane header)
wants `"end"`.

`<AdaptiveBar.Collapsed label>` is the same machinery with the width taken out:
every occupant relocates, unconditionally, for a slot whose layout config already
says "these live behind a `⋯`". `overflow` is `"panel"` (default) | `"scroll"`
(nothing leaves; the row scrolls) | `"clip"`.

## The one rule for consumers

> **Put the bar where there is slack to give:** as the growing cell of a
> single-line row (`Line` / `Row` / `Bar`), with no `Fill` or other `flex-1`
> sibling competing for the same slack, and never inside a shrink-to-content
> parent (`inline-flex`, `w-fit`, `Cluster`). One adaptive bar per row.
>
> Every box between that row and the bar has to relay the grow, not just the
> shrink — a `min-w-0` wrapper is still shrink-to-content. Inside a render slot
> that means the contribution declares `fill: true`, which is what makes its
> `slot-render` cell (and any wrapper the host adds inside it) a growing one.

This is a contract, not a styling preference. The bar declares itself
`min-w-0 flex-1`, so `barRoot.getBoundingClientRect().width` **is** the available
width — no ancestor walk, no mutate-reflow-restore, no forced style
recalculation per competing sibling. The primitive it replaces
(`responsive-overflow`) needed all of that machinery only because it chose a
content-sized container and then had to go looking for the width it had given
away.

Break the rule and you get told. Two guards, and they throw in dev and file a
report through `adaptiveBarReportSink` in prod, because taking down a pane header
over a layout disagreement is worse than a cramped row plus an alert:

- **no-slack** — once per bar, it hides everything the row is holding, re-reads
  the row, and puts it back. A bar that was *given* its width measures the same
  either way; one whose host shrink-wraps to it measures its own content twice.
  That is the whole premise checked directly, and the reason it is not a style
  proxy: `flex-grow` is `1` in the failing case (the bar sets it on itself), and
  a parent that shrink-wraps to its child can never be overshot by it — so the
  shape reads as healthy on every cheaper test. Recovery is the **ceiling**
  (everything inline, CSS clips), latched: a width the bar cannot trust makes
  eviction the one thing it must not do, and re-deciding against it oscillates.
- **overshoot** — the fit says everything fits and the rendered row still sticks
  out past its parent's content box. Commits the narrow floor. Reads the layout
  engine directly, so it is gated on a real one and never fires in jsdom.

A row that measures 0px while occupants are relocated out of it is the same
fault: "not laid out yet" is only honest while the row still holds everything it
was given, and believing it there is how the bar reaches a state it can never
measure its way out of.

## Why one stable container per item

Each occupant gets one plain `<div>`, created once in a `useState` initializer
and owned for the item host's whole life. React always renders the widget through
`createPortal(children, thatDiv)`; placement is then a **DOM operation on a node
React does not own**. React never sees the move, so the widget is never
unmounted, never re-instantiated, and — the point — never rendered a second time
to be measured.

The container must be minted once and never replaced, and that is a reconciler
rule rather than a matter of taste: React reconciles a portal by **container
identity**. Swapping a host element for a portal at the same position, or
changing a portal's container, deletes the subtree and builds a new one.
(`ViewportOverlay active={false}` is documented as a keep-alive seam and is not
one — `web/__tests__/viewport-overlay-keepalive.test.tsx` measures it and finds a
remount.)

Everything ancestry-derived that a portal severs — theme scope, plugin lineage,
pane id — is stamped onto the container **imperatively and unconditionally**, not
at move time. A move-time branch is a branch that can be wrong, and the symptom
would be a widget that renders in the wrong palette only after it has been
relocated once.

## What survives a re-parent, and what does not

`moveBefore` — the state-preserving move — fixes all of this. It is not
everywhere yet, and `tauri/` ships WebKit on macOS, so the fallback path is
written out and repairs what it can:

| | plain `insertBefore` | `moveBefore` | what the bar does |
|---|---|---|---|
| `<iframe>` | **reloads** | preserved | detects one and **refuses to relocate**, loudly — never silently reloads |
| focus | lost | preserved | snapshots `activeElement`, refocuses `{preventScroll:true}` |
| pointer capture | released | preserved | why the pointer lock is mandatory, not a nicety |
| top layer (open popover) | dropped | preserved | why the popup lock is mandatory |
| inner scroll offsets | reset | preserved | snapshots and restores the non-zero ones |
| CSS transitions | restart | preserved | never animate a bar item; animate the panel |
| `:hover` | recomputed | recomputed | not restorable — documented, not fixed |
| `position: sticky` | new containing block | same | **unsupported inside a bar item** |

The corollary is why **a node already in the right place is never touched**: each
still-inline container is docked immediately before its own anchor and skipped if
it is already there, and the panel's order is an LIS diff (`core/dock-plan.ts`),
so an unchanged order plans zero moves. A resize that relocates one widget leaves
the other six — their focus, their transitions, their scroll offsets — alone.

## Order is an input, and it comes from the DOM

Each item host renders a `hidden` anchor `<span>` at its natural position in the
host's own children, and the bar reads document order off those anchors. That is
not a convenience: the host may render its items through a slot whose reorder
middleware sorts them, wrapped in whatever containers it likes, and the DOM
already knows the answer. A registry keyed on mount order gets a mid-list
insertion wrong; a consumer-supplied order list is a second source of truth for
something nobody has to be told.

`hidden` means `display: none`, which means the anchor is not a flex item — no
width, and (the half that is easy to miss) no gap. The same trick carries
absence: an occupant whose contribution rendered nothing is `hidden`, so it costs
no gap either, and it is never eligible for the panel. That replaces
`action-presentation`'s old `probe` mode, which answered the same question by
instantiating every member a second time to draw nothing and be counted. A
`MutationObserver` on each container carries the signal back, because a
`display: none` element reports no resize when content appears inside it — so the
shared `ResizeObserver` can see a widget stop rendering but not start again.

## The panel is always mounted

"Closed" is `display: none` + `inert` + `aria-hidden`, never an unmount. The
panel holds the live DOM of relocated widgets, and `Popover` /
`DropdownMenuContent` both destroy their content on close — which would orphan
every container and kill the single instance this primitive exists to preserve.
So it composes `ViewportOverlay` + `OverlayPanel` + Floating UI directly: the
same three pieces `floating-surface` composes, but not `FloatingSurface` itself,
which returns `null` when closed.

It is a plain **dialog**, and nothing about it is derived from its occupants. A
`role="menu"` is wrong twice over: menu content unmounts, and inside a menu the
roving tabindex and typeahead eat the arrow keys a relocated `role="slider"`
needs. `inert` is load-bearing too — without it a parked slider stays focusable
and Tab drops the user into an invisible control.

The panel closes on the trigger, `Esc`, an outside pointer-down, and **becoming
empty**. A resize never closes it.

## Two locks, neither of which anyone opts into

React synthetic events bubble the **fiber** tree, not the DOM tree, so the bar's
own root sees a pointer-down inside a widget that physically lives in the
body-portaled panel. That is what makes both locks contract-free:

- a pointer down inside an occupant pins it for the whole gesture (with a
  document-level release as the fail-safe, because a pointer-up outside the bar
  reaches no React handler and a permanently pinned item is worse than a moved
  one);
- `PopupOpenScope` around each item pins one whose own popover is open.

`useHoldShrink` is left to cover only what survives the release — an inertial
fling's coast. A pinned item is frozen where it is and the bar re-fits everything
*around* it; the target placement is **stored, not discarded**, and the release
itself triggers the pass, so "deferred forever" is unrepresentable.

## The honest costs

- **The panel is Tab + Enter + Esc.** No typeahead, no arrow-key roving. A
  regression against a real `DropdownMenu`, and the price of hosting a live
  slider.
- **Entering or leaving reorder edit mode remounts every occupant.** In edit mode
  the bar renders everything inline in React's own tree, because dnd-kit handles
  re-parented out of their `SortableContext` are handles that silently do
  nothing. Crossing that edge means crossing the portal, and the portal *is* the
  identity-preserving mechanism — there is no version of this that keeps the
  instance. It is a deliberate user gesture, not a resize.
- **A placement change re-renders every occupant.** A rung is React state, so the
  bar must re-render for a widget to change form; there is no way to re-render
  only the one that moved.
- **One always-mounted `document.body` child per bar**, plus one hidden parking
  dock inside it.
- **The trigger is measured once by revealing it.** It is `hidden` while nothing
  is evicted, so the first fit has nothing to read; it is un-hidden, measured and
  re-hidden inside one synchronous block. One forced reflow, once per bar — and
  still better than the `MORE_BTN_W = 32` it replaces, which is simply wrong at
  any other control density. The no-slack probe costs a second one, on the same
  hide-measure-restore discipline.
- **`overflow="clip"` can silently drop a widget.** Kept because
  prompt-templates needs it and has a second route to the content. If it starts
  papering over layout bugs, the fix is a lint rule demanding a named reason, not
  a stricter default.

## Where the claims are proven

Four suites, because no one of them can carry the whole thing:

| where | what only it can prove |
|---|---|
| `core/*.test.ts` (bun) | the fit math, without a layout engine |
| `web/__tests__/` (jsdom) | React never unmounted the subtree; the pins; the panel's dock survives a close |
| `fixtures/index.ts` → `./singularity check layout-geometry` | the boxes do not collide and nothing spills, under a real layout engine, across a width sweep |
| `e2e/adaptive-bar-relocate.ts` (manual) | **a relocated slider still drags**, and comes back as the same instance |

jsdom has no layout engine and the shared `ResizeObserver` stub is inert, so the
jsdom suite supplies widths through `AdaptiveBarMeasure` — the primitive's own
measurement seam. Everything else (the fit, the docking, the pins, the panel)
runs exactly as it does in a browser. **`AdaptiveBarMeasure` is test-only**: a
consumer that "adjusts" measurement is lying to the layout engine about a number
the layout engine owns.

The layout-harness fixture is the proof surface for the rich case, because every
production surface reachable today is made of plain actions and none of them
exercises the premise — *a draggable widget relocates and is still draggable*.

---

## `core/` — the pure decision math

No DOM, no React, so it is exercisable without a layout engine.

| module | answers |
|---|---|
| `core/fit.ts` | which rung each item renders at, and who leaves the row |
| `core/width-cache.ts` | what each item measured at each rung, and how much we trust it |
| `core/dock-plan.ts` | the fewest DOM moves that turn one dock order into another |

### The four rules worth knowing before you touch this

**Only an inline item is measurable.** A width read while the widget sits in the
panel describes the panel, so `write` refuses it outright. That single asymmetry
is why the rest of the ledger exists: everything not currently rendered inline is
inference.

**An estimate may refuse a fit; it may never fabricate one.** An unmeasured rung
is bounded by the nearest *wider* measured rung — a narrower form is never wider
than a wider one, so that is an upper bound. When there is no wider measurement
at all there is no bound, and `assign` reports `fits: false` rather than
substituting a 0. `usedEstimate` is how a caller tells "fits" from "probably
fits"; do not collapse them.

**One estimated step per pass.** An item whose next rung is a guess is demoted at
most once per `assign` call. Without the cap, a chain of guesses would relocate a
widget that compaction alone would have saved — and the mistake is unlearnable,
because a panelled widget is never measured again. The cost is one extra pass on
the first overflow of a session.

**A node already in the right place is never touched.** `planMoves` is an LIS
diff, not a re-append: an unchanged order plans zero moves. Every avoided move is
a preserved focus, pointer capture, CSS transition and inner scroll offset.

### Hysteresis, and the two things `assign` reads about the present

`assign` computes a current-state-independent ideal — it seeds everything at its
widest rung and only demotes — and then reads `currentRung` for exactly two
things:

- **freezing** a `pinned` item (a live drag, an open popup);
- **H1, the promote band**, applied to the ideal as one all-or-nothing guard: if
  any item would end wider than its `currentRung` and the ideal total lacks
  `hysteresisPx` of slack, *every* such item goes back to its `currentRung`. So a
  one-pixel resize cannot flip the row back and forth. Outside the band the
  answer ignores placement entirely.

(The design doc says `assign` never reads `currentRung` for an unpinned item.
That sentence is wrong and is being corrected: hysteresis *is* direction
dependence, and direction can only come from current state.)

**This is why a brand-new occupant is seeded at rung 0 and never at `null`.**
`currentRung: null` means EVICTED — there is no third state for "unknown". Seed a
newcomer at `null` and its first inline placement reads as a promotion, so H1
holds it out of the row until the bar grows by a further `hysteresisPx`: a freshly
contributed action that simply never appears. Pinned in
`web/__tests__/relocation.test.tsx`.

`blocked` (H2) is the same idea for a promotion that was *committed* and then
measured as not fitting: that rung is barred until the row is genuinely wider
than the width that rejected it.

### What the driver does with `fits` and `usedEstimate`

Not a lot, deliberately, and the two are never collapsed into one boolean.
`fits: false` means the row is at its floor and STILL overflows (or a width has
no bound at all) — but the bar already clips or scrolls by CSS, so that outcome
is handled structurally rather than by a branch. The one place `fits` is read is
the overshoot guard, and only on a **converged** pass: `overshootsParent`
measures the row as *rendered*, which is the committed placement, so checking it
against a placement we are about to commit would report a disagreement between
two different configurations — and throw over it in dev.

`usedEstimate` deliberately does not gate that guard. An estimate is an upper
bound, so it can refuse a fit but never fabricate one; a `fits: true` reached
through estimates is still a claim that the row fits, and an overshoot still
contradicts it.

### `yieldRank`: higher yields sooner

The highest-ranked item is demoted first. A widget that declared itself eager
gets a high rank; `"never"` maps to the lowest rank, so it is the last thing the
bar touches — not a hard pin. Ties go to the **later** item in bar order.

One consequence is a genuine design choice and worth stating out loud: the search
takes the eagest occupant **all the way to its floor** — compact, then out of the
row — before it asks anyone else for anything. The alternative (one step each,
round-robin) leaves every widget half-shrunk instead of most of them intact.

### The `null` that is not a missing key

The web half's placement map stores `null` for "left the row" and simply omits an
item it has never placed. Those are two different absences, and `?? 0` collapses
them — `null ?? 0` is `0`, which puts every evicted occupant straight back in the
row and makes the bar look like it never overflows at all. `rungOf()` in
`web/internal/adaptive-bar.tsx` is the one place that distinction is made; do not
inline it.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Overflow as relocation, not transformation: a bar that asks each widget for a smaller form of itself and moves the rest — as themselves, ONE live instance each, never rendered twice — into an always-mounted panel. Each occupant owns one stable portal container the bar re-parents imperatively, so a relocated slider is still the same slider mid-drag; measurement reads the real nodes, and every policy (which forms exist, how eagerly to yield) comes from the widget through action-presentation rather than from the host.
- Web:
  - Uses:
    - `primitives/action-presentation.ActionFormProvider`
    - `primitives/action-presentation.ItemFormChannel`
    - `primitives/css/spacing.SpaceStep`
    - `primitives/css/spacing.Stack`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.OverlayPanel`
    - `primitives/css/ui-kit.SingleLineProvider`
    - `primitives/css/ui-kit.usePortalForwardedAttrs`
    - `primitives/css/viewport-overlay.ViewportOverlay`
    - `primitives/edit-mode-signal.useEditMode`
    - `primitives/element-size.useResizeObserver`
    - `primitives/icon-button.IconButton`
    - `primitives/popup-open.PopupOpenScope`
  - Exports (types):
    - `AdaptiveBarAlign`
    - `AdaptiveBarCollapsedProps`
    - `AdaptiveBarFault`
    - `AdaptiveBarFaultKind`
    - `AdaptiveBarItemProps`
    - `AdaptiveBarOverflow`
    - `AdaptiveBarProps`
    - `MeasureWidth`
  - Exports (values):
    - `AdaptiveBar`
    - `AdaptiveBarCollapsed`
    - `AdaptiveBarItem`
    - `AdaptiveBarMeasure`
    - `adaptiveBarReportSink`
- Cross-plugin:
  - Imported by:
    - `apps-core/tab-bar`
    - `apps/sonata/library`
    - `conversations/conversation-view/prompt-templates`
    - `primitives/pane`
    - `reorder/node-types/overflow`
- Core:
  - Exports (types):
    - `DockMove`
    - `FitInput`
    - `FitItem`
    - `FitResult`
    - `MeasuredWidth`
    - `WidthCache`
    - `WidthEstimate`
    - `WidthMeasurement`
    - `WriteRefusal`
    - `WriteResult`
  - Exports (values):
    - `assign`
    - `dropItem`
    - `emptyWidthCache`
    - `estimate`
    - `inlineWidthsFor`
    - `planMoves`
    - `staleOthers`
    - `widthKey`
    - `widthKeyItemId`
    - `write`

<!-- AUTOGENERATED:END -->
