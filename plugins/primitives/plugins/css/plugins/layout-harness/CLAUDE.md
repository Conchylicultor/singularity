# layout-harness

A **layout-primitive geometry regression harness**. Layout overlap/clip bugs (the
`CollapsibleCard` badge-over-path class) used to be caught only by eyeball. This
plugin standardizes one harness: a declarative **fixtures catalog** spanning all
css primitives, rendered with the real React components + real Tailwind, measured
by a **generic geometry oracle**, and (eventually) wired into
`./singularity check layout-geometry` so any reappearing overlap fails the gate.

## How fixtures are contributed

Each primitive drops a `fixtures/index.ts` (default-export `HarnessFixture[]` —
`LayoutFixture` and/or `RegionFixture`, see below), exactly mirroring how each
check is `<plugin>/check/index.ts`. `fixtures` is a
**collected-dir** runtime (marked by `defineCollectedDir("fixtures")` in
`core/collected.ts`); codegen auto-discovers it and emits `core/fixtures.generated.ts`
with zero codegen edits when a new primitive contributes. A fixture is pure data
plus `render: () => ReactElement` — author `data-geo="<slot>"` on the boxes you
want measured.

## Region fixtures: the harness supplies the children

A `LayoutFixture` authors its own children. A **`RegionFixture`** authors a
**hole** — `render: (children) => ReactElement` — and the harness fills it with
`REGION_CHILDREN`, the one kit in
[`web/internal/region-children.tsx`](web/internal/region-children.tsx). The
author says "this box opens a region"; the harness says what goes in it.

**Why the kit is not authorable, at all.** A fixture that writes its own children
only ever measures the child kind its primitive already handles. `control-panel`
is the worked example: five fixtures, all green, every one rendering `Row`s —
while a raw `<Input>` dropped into a panel sat ~50px left of every label around
it. **Three geometry bugs shipped past that green suite**, and the remedy on the
books was a sentence asking authors to render something else — rung 5 of the fix
ladder. This is rung 1: there is nowhere to say what the children are.

The gate grows by adding a member to `REGION_CHILDREN` once; **every** contributed
region is re-gated by it, including regions contributed long before the member
existed. Each member covers a distinct way a region gets it wrong:

| Member | What only it catches |
| --- | --- |
| `bare-input` | the case that actually broke — a form control dropped straight in |
| `bare-button` | a shrink-to-fit control, where the input stretches to fill |
| `bare-text` | prose with no chrome of its own for a per-child rule to inset |
| `contents-wrapped` | how a CONTRIBUTED panel arrives — `renderIsolated` wraps every contribution in a `display: contents` span, transparent to layout and opaque to selectors, so a region insetting via `> * + *` matches nothing |
| `follower` | the **other topology** — a `rail-follow` band that insets ITSELF (data-view's shape). The only member that applies anything, so the only one that can catch a double-pay: put it under a region that also pads and 24px becomes 48px unless `--rail-owed-*` is honoured |
| `bled-row` | the escape: `rail-bleed` cancels the inset and re-applies it as one class, and the content must come back to the same rail |

`railAlignment` itself is topology-blind — it measures content against
`railOrigin + railStart`, which both the inherit-by-doing-nothing and the
follow-it-yourself shapes satisfy when correct. The kit, not the oracle, is what
makes the second shape present at all.

A region cannot pick its invariants either.
[`expand-region-fixtures.ts`](web/internal/expand-region-fixtures.ts) supplies
them — `railAlignment`, `noClip`, and a `railOverride` falsification — and
rewrites each region into an ordinary `LayoutFixture`. That expansion is pure
sugar: all three consumers below keep consuming `LayoutFixture`, and neither the
suite, the check nor the gallery knows a second fixture kind exists.

### How the rail is measured

`railAlignment` asserts that at every width, **every** measured slot's
`contentLeft` (`rect.left + paddingLeft`) equals `railOrigin + railStart`. Three
mechanics carry that:

- **The rail is resolved to pixels by laying it out, never by parsing text.**
  `--rail-start: var(--space-lg)` has the computed value `1rem`, and
  control-panel's rails are `calc()` chains — `parseFloat` reads `1` and `NaN`.
  `__measure` sizes a hidden probe by the var and reads back its box (the same
  idiom as `ui-kit/e2e/scroll-fade-verify.ts`), with a sentinel `var()` fallback
  so **unpublished** and **`0px`** stay distinguishable.
- **It is read from inside the region**, off the harness's own
  `data-geo-rail` marker (a `display: contents` wrapper around the kit), because
  custom properties inherit downward: the region publishes on its own box, a
  descendant of the container. `railOrigin` is then found by walking back UP from
  the marker to the outermost ancestor still reporting that same value — the
  publisher — and taking its **padding-box** left edge. Padding box, not border
  box: a bordered `OverlayPanel` would otherwise read 1px off at every width.
- **A region publishing NO rail fails.** Publication is what makes the number
  knowable from outside the primitive, so "I inset correctly but told nobody" is
  a failure and not a style. That is the whole of what turns the rail contract
  from a convention into something a build can check.

Two falsifications, each isolating a different bug, both mutating from the marker
(below the region, above the children — the cascade is per element, so a
declaration on the region itself would lose to the region's own):

- **`railOverride`** re-publishes the rail as `0px`. The children stay where the
  region put them; only the claimed number moves. So a green result would mean
  the oracle was merely checking the children agree with each other.
- **`railOwedOverride`** forces `--rail-owed-*` back to the full rail, which only
  a `rail-follow` child reads — reproducing the double-pay (24px → 48px) while
  every inheriting sibling stays put. It can only be satisfied by the `follower`
  member, so it fails loudly the moment the debt stops being paid.

A third mutation, **`shrinkSlots`**, is not about regions: it sets
`flex-shrink: 1; min-width: 0` on every `[data-geo]` box — what an ordinary flex
item is — so the engine takes its row's deficit out of the measured boxes. It is
the falsification for any primitive whose contract is *a box I measure is the
size of its own content, whatever else is in the row*, and it pairs with
`rigidIntegrity` (adaptive-bar's `squeezable-occupants`).

A fourth, **`shrinkWrapHost`**, is about the box ABOVE the primitive. It sets
`width: max-content` on the element the fixture marked with `HOST_MARKER_ATTR`,
so the host stops handing the primitive a width and starts taking its width from
it. (That marker is exported from `core/`, unlike the rail's: the rail marker
wraps children the harness itself supplies, while this one names a box in the
fixture's own tree, and a fixture may import nothing but the core barrel.)

It is the historical broken construct for every *measure-then-decide* primitive,
not only the bar it was written for: the width such a primitive reads stops being
an input and becomes an output of its own last decision, so each pass shrinks the
number that decides the next one — a one-way ratchet ending wherever the content
runs out. Nothing in the declaration says so (a `flex-1` child of a `w-fit`
parent has grow 1 and no slack), which is exactly why proving a guard against it
needs a real layout engine rather than a style assertion.

Two things about it shape the fixture you write around it:

- **It lands after the primitive has mounted and settled** — `applyMutation` runs
  on the painted DOM. That is the fault's real shape in the app too (a framing
  variant swaps, a wrapper's class flips, contributions arrive in a later plugin
  wave), so what it falsifies is the *schedule* of a premise check as much as its
  existence: a primitive that asks its host once at mount passes this mutation
  while ratcheting itself empty afterwards.
- **It freezes the row it finds.** It runs synchronously right after the render
  commits, before any `ResizeObserver` has re-fitted anything, so `max-content`
  sizes to the PREVIOUS width's content. A fixture must therefore sweep wide →
  narrow: a mutated pass restarting narrower than the state it inherits clips on
  the stale content alone, which is a falsification that would bite with the
  guard removed and therefore proves nothing.
  `adaptive-bar/host-stops-giving-room` is the worked example and states both
  constraints at its `widths`.

A fifth, **`swapSlotRole`**, re-declares ONE `[data-geo]` box as a different
space-sharing role — the closed set `rigid | yield | grow | fill` the css
primitives own. Role-shaped rather than mechanic-shaped, so a fixture states the
mistake it reproduces ("someone reached for Fill here") and one mutation covers
every wrong-role falsification in the family. It writes `flex` LONGHAND because
the basis is the point: `fill`/`grow` are basis 0 (a claimant that shares the row
by grow factor), `yield`/`rigid` are basis auto (content-sized). `yield` vs
`fill` is the motivating pair — both carry `min-width: 0`, so only a real layout
engine across a width sweep separates them (`yield/siblings-yield-together`).

**Known limit:** two nested regions publishing the *same* value resolve to the
outer one as publisher. Nesting is shadowing, so a correct inner region uses a
different step; a fixture that genuinely needs identical nested rails is not
expressible today.

## The three consumers (one catalog, generic collection)

Per the collection-consumer separation rule, every consumer reads fixtures only
through the generic `loadFixtures()`:

1. **the geometry `bun:test`** (`web/internal/layout-geometry.test.ts`) — builds
   the measurer page ONCE (`build-fixtures-page.ts`: Vite + React + real
   Tailwind), opens ONE headless Chromium (`measure-page.ts`), sweeps the catalog
   across each fixture's `widths`, and calls `evaluateInvariant` per invariant. A
   `falsification` invariant is re-measured with its mutation applied and asserted
   VIOLATED (proof the gate bites). jsdom can't lay out grid/overflow, so this
   drives a real browser. It also fails on a **page error** — see below.
2. **the contributed check** (`check/index.ts`, id `layout-geometry`) — shells out
   to (1), gated by a sidecar marker keyed on a sha256 of the WORKING-TREE
   content (tracked + untracked-not-ignored) of the css subtree, ui-kit
   `app.css`, and **every fixture contributor's whole plugin subtree**. An
   unchanged input set ⇒ ZERO browser launches; a touched css primitive re-runs.
   It folds the same sig into `cacheSignature()` so the runner's own cache also
   short-circuits identical full-tree reruns. Fails loudly (no auto-install) if
   Chromium is unprovisioned.

   When the marker IS absent the suite actually launches a browser, which used to
   flake under load ("hook timed out / headless-launch timeout"). Four guards now
   make that healthy-but-slow path robust:
   - **bun:test timeout.** The suite's `beforeAll` (Vite build + cold Chromium
     launch + page load) routinely exceeds bun:test's default 5s per-hook budget.
     The suite declares its own 120s hook budget (`SETUP_TIMEOUT_MS`), so it is
     correct however it is invoked — a flag on one caller is not a property of a
     suite, and `./singularity test <this plugin>` used to report a hook timeout
     that had nothing to do with geometry. The check still spawns
     `bun test --timeout 120000` as belt-and-braces, and `measure-page.ts`
     likewise raises Playwright's own 30s `launch` timeout to 120s.
   - **host-wide serialization + grant.** The run is gated behind
     `defineHostPool({ id: "layout-geometry", size: 1, cost: { cpu: 1 } })`
     (`@plugins/infra/plugins/host-admission`): size 1 ⇒ at most one suite (Vite
     build + Chromium) runs across all worktrees, so concurrent builds don't all
     launch Chromium at the same instant and thrash CPU. The check ALSO spends a
     `ctx.grant` unit around the launch, so the run is both mutually-exclusive AND
     accounted against the invoking build's CPU grant — two different guarantees
     (mutual exclusion vs. budget), so it keeps both.
   - **double-checked marker.** The marker is re-checked after acquiring the slot,
     so same-sig peers that queued behind the first runner collapse to a single
     launch instead of re-running the suite.
   - **environmental-timeout classification.** If the suite still fails, its full
     stdout+stderr is run through `check/classify.ts`'s `classifyFailure`: a pure
     timeout (bun hook/test timeout or a Playwright launch/goto/wait timeout, with
     no oracle-invariant or `AssertionError`/`falsification` signature present) is
     returned as a non-fatal `inconclusive` result — the build deploys anyway and,
     because no pass marker is written, re-verifies the geometry next build. A real
     regression (any oracle-invariant kind, `AssertionError`, `falsification did
     not bite:`, `fixture page error:`, or anything unrecognized) stays fatal
     (fatal wins on any overlap; ambiguous → fatal). `fixture page error:` is
     fatal specifically because a crashing fixture usually times out as well, so
     the two signatures co-occur and the crash must win.
3. **the live Layout Lab gallery** (`web/index.ts` → Debug sidebar) — renders the
   catalog in-app (the human-eyeball complement; no measurement). Each (fixture,
   width) card is wrapped in `PluginErrorBoundary`, so a fixture that throws
   costs its own cell and not the catalog. The slot middleware's boundary cannot
   do this — its granularity is the whole pane.

### The signature covers the primitive, not just the fixture

A fixture is a few lines of JSX; what it measures is the primitive it renders.
So `check/index.ts` derives each contributor's plugin root from the
`plugins/**/fixtures/**` matches (`<root>/fixtures/…` ⇒ `<root>`) and hashes
that whole subtree. Derived, not listed, so a plugin that starts contributing
fixtures is covered the day it does. Keep `computeSig` sync and cheap —
`cacheSignature()` calls it on every check run.

### How the measurer page is served

The built page is served over a LOCAL HTTP server (ephemeral `127.0.0.1:<port>`),
NOT `file://`: Vite emits an ES-module `<script type="module">` + a stylesheet
`<link>`, and under `file://` the browser treats every asset as cross-origin
(`origin: null`) and CORS-blocks the module/stylesheet fetch. http gives every
asset one real origin. Token VALUES (`--space-*`, pads, control heights) are
emitted at RUNTIME by ThemeInjector (never static CSS), so `entry.html` seeds the
DEFAULT density ramp on the measured `[data-geo-root]` — the same default the
bespoke tests hardcoded — for faithful gap/pad geometry; a monospace 14px font is
forced for cross-machine width determinism.

## The `data-geo` contract

Slot identity is the `data-geo` attribute authored by the fixture. The oracle
NEVER references a primitive's internal class names, so it survives refactors of
the primitive's mechanics. The harness's `__measure()` reads `[data-geo]` boxes +
`scrollWidth > clientWidth` (the truncation signal) + DOM order into a
`MeasuredFixture`.

**A slot that generates no boxes is skipped, not measured as 0×0.**
`getBoundingClientRect()` on a `display:none` element is all zeros, so a hidden
slot would otherwise report a box at the viewport origin — which "overlaps" every
sibling by its full width and "clips" past every container edge. Both are
artefacts of asking a non-participant where it is. Skipping it in `__measure`
(rather than per oracle rule) makes it identical to a slot the fixture did not
render, which every rule already tolerates. Fixtures with a conditionally-shown
affordance depend on this — adaptive-bar's `⋯` trigger, hidden until something
overflows, was the first.

## Settling: measure by observation, never by a frame count

`measure()` re-measures until two consecutive frames agree (capped at 30, so an
oscillating layout fails on its own geometry instead of hanging).

The double-rAF this replaced assumed layout is final once the render is committed
and painted — true only while layout is pure synchronous CSS, which every fixture
was until adaptive-bar. A primitive that lays itself out from a `ResizeObserver`
settles LATER by construction: the observer is delivered after layout, its handler
is rAF-debounced, and each decision it commits is a React render whose own layout
effect may measure and decide again. The frame count is a property of the fixture,
not a constant the harness can know.

Measuring mid-settle reads a transient, and the symptom is not subtle-looking: the
gate reports the PREVIOUS width's geometry as an overlap/clip at the current
width, with plausible pixel values. If you ever see a failure whose numbers match
the adjacent sweep step exactly, suspect settling before you suspect the
primitive.

## A crashed fixture fails the gate

`measure-page.ts` collects `page.on("pageerror")` into a buffer the suite drains
(`takePageErrors()`, drain-on-read). Without it the gate measured whatever DOM
React left behind after tearing a crashed subtree down — two frames agreed, the
oracle judged a corpse, green.

Drained per WIDTH inside `sweep` (the only place the fixture *and* width are
known), plus once after the page loads and once per fixture for late arrivals. A
crash also rejects the `measure()` call with Playwright's own
"Execution context was destroyed", which names nothing — so the buffer wins and
the driver error is re-thrown only when the buffer is empty.

Deliberately NOT `console` messages of type `error`: a 404 on a source map or a
component's own diagnostic log is not a fixture that stopped rendering, and the
measurer page mounts no error boundary, so React funnels every uncaught
render/commit error through `reportError` and into `pageerror` anyway.

**The gate does not see a primitive's dev-only assertions — but only because
`build-fixtures-page.ts` now pins it.** A primitive that reports loudly in dev
and degrades quietly in prod reaches this gate through its *quiet* branch, so a
fixture must assert the degraded shape as geometry (adaptive-bar's strip
fixtures use `rigidIntegrity` for exactly this: occupants floored into the panel
disappear from the row) and must not rely on the page-error drain to notice.

That used to rest on "Vite's `build()` with no `mode` defaults to production", and
that is **wrong in the one context that matters**. Vite resolves `isProduction`
from the ambient `process.env.NODE_ENV` first and consults `mode` only when it is
unset — and this page is built by a suite running under `bun test`, which sets
`NODE_ENV=test`. So the gate was building a DEVELOPMENT page: `import.meta.env.DEV`
was `true`, every `if (import.meta.env.DEV) throw` was live, and the first fixture
to deliberately reproduce a construct a primitive asserts against (adaptive-bar's
`host-stops-giving-room`) took the page down with a `fixture page error` instead
of being measured. Building it by hand — no `NODE_ENV` — produced the opposite
page, which is how the claim survived a hand-verification. The builder now pins
`import.meta.env.DEV` / `PROD` and `process.env.NODE_ENV` in `define`, so the
page is a production one whoever invokes it.

## The oracle (`core/oracle.ts`)

Pure, DOM-free functions — one per `GeometryInvariant` kind (`noOverlap`,
`noClip`, `leftPack`, `rigidIntegrity`, `pinnedRight`, `neverTruncatesWhenRoomy`,
`truncationOnsetOrder`, `truncatesTogether`, `railAlignment`), dispatched by
`evaluateInvariant`. The last two are the two halves of the shrink hierarchy and
neither can express the other: `truncationOnsetOrder` asserts STRICT priority
(one cell gives up characters first), `truncatesTogether` asserts the row shares
its deficit (at every width, all listed slots truncate or none does). A
new kind MUST also be listed in `check/classify.ts`'s `ORACLE_INVARIANT_KINDS`,
or a real regression is misclassified as an environmental timeout and passes
non-fatally. The math is ported
exactly from the bespoke `frame/web/internal/frame-geometry.test.ts`, the oracle
being generalized. `rigidIntegrity` is measured-stable (max−min slot width ≤ ε),
not a magic px constant. `falsification` is NOT evaluated by the oracle — the
suite handles it by re-rendering the mutated construct and asserting the inner
`expectViolated` invariant is VIOLATED (proof the oracle has teeth).
`core/oracle.test.ts` is the oracle's own correctness proof on synthetic boxes.

## Wiring footgun

`fixtures/index.ts` is **web React/JSX**, so its glob lives in the **web** tsconfig
(`plugins/framework/plugins/web-core/tsconfig.app.json`), NOT the node
server-core tsconfig where `check`/`facet` live. The
`collected-dir-tsconfig-coverage` check enforces some tsconfig covers
`**/plugins/*/fixtures`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Live Layout Lab gallery: renders the layout-primitive fixture catalog across its width sweep, opened from the Debug sidebar.
- Web:
  - Slots: `layoutLabPane.Actions`
  - Contributes:
    - `Pane.Register` "layout-lab"
    - `DebugApp.Sidebar` "Layout Lab" → `component`
  - Uses:
    - `apps/debug/shell.DebugApp`
    - `primitives/app-shell.sidebarNavItem`
    - `primitives/css/card.Card`
    - `primitives/css/scroll.Scroll`
    - `primitives/css/spacing.Inset`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.SectionLabel`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.Input`
    - `primitives/error-boundary.PluginErrorBoundary`
    - `primitives/loading.Loading`
    - `primitives/pane.openPane`
    - `primitives/pane.Pane`
    - `primitives/pane.PaneChrome`
  - Exports (values): `layoutLabPane`
- Core:
  - Uses:
    - `framework/tooling/collected-dir.defineCollectedDir`
    - `framework/tooling/collected-dir.loadCollectedDir`
  - Exports (types):
    - `FixtureDims`
    - `FixtureMutation`
    - `FixtureState`
    - `GeometryInvariant`
    - `HarnessFixture`
    - `LayoutFixture`
    - `MeasuredBox`
    - `MeasuredFixture`
    - `OracleResult`
    - `RegionFixture`
  - Exports (values):
    - `checkLeftPack`
    - `checkNeverTruncatesWhenRoomy`
    - `checkNoClip`
    - `checkNoOverlap`
    - `checkPinnedRight`
    - `checkRailAlignment`
    - `checkRigidIntegrity`
    - `checkTruncatesTogether`
    - `checkTruncationOnsetOrder`
    - `evaluateInvariant`
    - `fixturesCollectedDir`
    - `HOST_MARKER_ATTR`
    - `isLayoutFixture`
    - `isRegionFixture`
    - `loadFixtures`

<!-- AUTOGENERATED:END -->
