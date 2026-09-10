# compare

The **Compare** stage of the prototype detail pane: the prototype mock on the
left, the real app thing it says it mocks on the right, both live, both
interactive, and both at **one width** the reader changes.

This plugin owns three things and names no kind of counterpart:

1. **Reading the declaration.** A prototype names its counterpart in its own
   document, as `<meta name="mocks" content="<kind>:<ref>">`. The `files`
   plugin parses that on the wire (`parseMocks` → `none` / `malformed` /
   `declared { tag, ref }`), so this stage never sees a raw string.
2. **Dispatching on the kind.** `Counterpart.Kind` (`web/slots.tsx`) is a
   dispatch slot keyed on the tag. A kind is a child plugin under `plugins/`
   contributing `{ match: "<tag>", label, example, component }`. Shipped kinds:
   `fixture` (a layout-harness fixture) and `route` (the running app at a
   path). A third kind is a new folder here and no edit to this plugin.
3. **The chrome** (`counterpart-stage.tsx`): the width control, both halves,
   the per-half error boundary.

## The contract: a kind resolves, the stage renders

A kind contributes a **component whose only output is `children(resolution)`**
(`CounterpartKindProps` / `CounterpartResolution`, `web/types.ts`). It is a
real component — it may run hooks (the fixture kind loads a catalog in an
effect, the route kind reads the app registry) and it mounts inside the dispatch
middleware's error boundary — but it paints no layout of its own. So the
shared-width invariant lives in exactly one place, and a kind cannot re-derive
it differently.

The resolution has three arms, and every one is a state the stage renders:

- `loading` — the kind does not know yet. Never the "no counterpart" copy, which
  would be a claim about the user's file that reverses itself.
- `unresolved { title, detail }` — the kind understands the tag but cannot
  resolve the ref here (no such fixture on this branch; no pane at that path).
- `found { widths, title, subtitle?, badge?, render(width) }` — the widths this
  counterpart has something to say about, and how to paint it at one of them.

The kind's `target` prop is everything after the first colon; it is not named
`ref` because that collides with React's `RefAttributes` on a `ComponentType`.

## The four visible states

| State | Decided by | What the reader sees |
| --- | --- | --- |
| no tag | the parser | "does not say what it is a mockup of" + every registered kind's example line |
| malformed | the parser (also a `problems[]` entry on the card and Focus banner) | the raw line, the reason, the syntax, the known kinds |
| unknown kind | the dispatch fallback (`UnknownKind`, in `slots.tsx`) | "nothing in this worktree shows a `<tag>:` counterpart" + the known kinds |
| unresolvable ref | the kind itself | the kind's own sentence (fixture: missing / region; route: no app / no pane) |

The example lines come from the registry (`useCounterpartKinds()`), never from
a hardcoded pair, so a new kind documents its own syntax by existing. The
fallback lives in `slots.tsx` rather than its own file because it reads the
registry it falls back from — a fallback file importing the slot while the slot
imports the fallback would be an import cycle.

## Shared width is the whole affordance

One control moves both halves. Not a draggable divider — that trades room
*between* the two, so every reading is a different question.

The widths offered are the counterpart's own (`resolution.widths`), and the
stage opens at whichever is closest to the prototype's declared viewport width —
the width the mock was drawn at, so the one it is certain to have something to
say about. With one width offered, the control is a label. While the counterpart
is loading or unresolved, a placeholder list (`360 / 640 / 960`) keeps the mock
half at a real width.

The mock half renders in **every** arm: the mock is known the moment the pane
opens, and making it wait on the counterpart would be a second unknown standing
in for a known thing.

## Zoom: fit the pair on screen without reflowing it

The **Zoom** control (`Fit` by default, or `100%`) paints both halves smaller by
ONE factor without changing the width they are laid out at: each half's content
sits in a `ScaledBox` exactly the shared width wide, `transform: scale()`d. So
the zoomed pair is the 100% pair shrunk, every proportion kept.

Fit is the largest factor at which the WHOLE pair fits the pane — width and
height both — computed by `fitPair` (`web/fit-pair.ts`, pure and tested) from
what `usePairRoom` measures: the room inside the stage's inset, the one-line
label band above each frame, and the gap between halves (the chrome that does
not zoom comes off the room first). It tries the pair side by side and stacked,
and takes whichever paints them bigger: two wide screens side by side are a
strip three times wider than tall, which a landscape pane holds well and a
narrow one (the gallery open beside it, a portrait window) holds far better
stacked. The pair is fitted to the mock's declared viewport — a route
counterpart's frame is that same box — and centred in whatever is left over.
A fixture taller than the mock overflows and scrolls. Fit never zooms in; 100%
is always side by side.

The chrome is kept to what does not steal room from the renderings: a small
inset, a small gap, a one-line label (it truncates, so its height is constant),
and a frame that is a ring rather than a padded card — a ring paints outside
the box and takes no layout.

## Why the mock frame is not `ScaledIframe`

`ScaledIframe` mounts a prototype at its declared viewport and `scale()`s it to
fit, so a 320px box shows the 1280px layout shrunk. Next to a counterpart that
genuinely reflows at 320px, that compares nothing.

So `MockFrame` mounts a plain iframe **at** the chosen width, and the prototype's
own media queries run. A prototype authored at one fixed width then crops and
scrolls instead of rearranging — that *is* the answer ("the mock has nothing to
say about this width"), not a defect to paper over with a scale factor. (Zoom
is different: it lays both halves out at the chosen width first and only then
paints them smaller, so it never changes what either half says.) Height
is the prototype's declared viewport height, since an iframe never sizes to its
content. Sandbox posture is unchanged from every other prototype frame:
`allow-scripts allow-same-origin`.

`resolution.render(width)` runs inside a `PluginErrorBoundary`: the slot
middleware's boundary is the whole pane, which would take the mock down with it
and leave nothing to compare against.

## Diffing the two halves from outside: `e2e/compare-diff.ts`

The stage puts the mock and the real thing side by side for a person. The
`compare-diff` script does the same for an agent, and then subtracts one from
the other:

```bash
./singularity run plugins/apps/plugins/prototypes/plugins/compare/e2e/compare-diff.ts \
  --name proto-1786877040-3k6f [--width 1280] [--out /tmp/mist] [--fail-above 5]
```

It opens this pane's Compare stage on the deploy this checkout built, waits for
the counterpart to resolve, photographs both halves at the shared width, and
writes `<out>-mock.png`, `<out>-app.png`, `<out>-diff.png` and
`<out>-side-by-side.png`, logging the differing-pixel ratio and a per-cell
heatmap. `--fail-above <pct>` turns the ratio into a verdict; without it the
run is a transcript tool.

The pixel diff is salient by construction — a surface one shade off passes
it — so colour is reported separately, with the colours named: the dominant
colours of each half and the ΔE to their counterparts (the background first),
the mean colour of each region, and the luminance profile across rows and
columns. That is `<out>-colors.png` and the "colour report" block in the
transcript; `--delta-e` sets the drift line (default 5).

**It drives the stage, it does not re-implement it.** The script never reads
the `mocks` tag and names no kind: the stage dispatches the declaration exactly
as it does for a person, so a kind contributed tomorrow is diffable the same
day, and the counterpart is always the app as this deploy renders it. What the
script needs from the stage is only *which two boxes to photograph*, and the
stage publishes that as DOM attributes — `data-compare-half="mock" |
"counterpart"` on each half's frame (the ring paints outside it, so at 100%
zoom the frame is the rendering edge to edge — the script switches to 100%
before it captures), plus `data-compare-status="loading" | "unresolved" |
"found"` on the counterpart's. The names are exported from this plugin's
`core/` (`COMPARE_HALF_ATTR`, `COMPARE_STATUS_ATTR`, `compareHalfSelector`),
which is the one spelling the stage and the script both read: an `e2e` script
may import a plugin's `core` but never its `web`.

Both captures come out of the same Chromium at the same width, which is what
makes a pixel diff honest here — the pixel arithmetic itself is the harness's
`diffImages` (see `tooling/e2e-harness/CLAUDE.md`), not anything of this
plugin's.

Design: `research/2026-09-10-global-prototype-counterpart-kinds.md`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The Compare stage of the prototype detail pane: the prototype mock beside the real app thing it declares it mocks (<meta name="mocks" content="<kind>:<ref>">), both live and both at one shared width the reader changes. Owns the declaration dispatch and the side-by-side chrome; each kind of counterpart (a layout-harness fixture, the running app at a route) is a child plugin contributed into the open Counterpart.Kind registry.
- Web:
  - Slots: `Counterpart.Kind` ← `apps.prototypes.compare.fixture`, `apps.prototypes.compare.route`
  - Contributes: `PrototypeStages.Stage` "Compare" → `CompareStage`
  - Uses:
    - `apps/prototypes/gallery.PrototypeStages`
    - `primitives/bar.Bar`
    - `primitives/css/badge.Badge`
    - `primitives/css/clip.Clip`
    - `primitives/css/column.Column`
    - `primitives/css/line.Line`
    - `primitives/css/scroll.Scroll`
    - `primitives/css/spacing.Inset`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/toggle-chip.SegmentedControl`
    - `primitives/dom/element-size.useResizeObserver`
    - `primitives/error-boundary.PluginErrorBoundary`
    - `primitives/loading.Loading`
    - `primitives/slot-render.defineDispatchSlot`
  - Exports (types):
    - `CounterpartKindMeta`
    - `CounterpartKindProps`
    - `CounterpartResolution`
    - `WidthChoices`
  - Exports (values):
    - `Counterpart`
    - `useCounterpartKinds`
- Cross-plugin:
  - Imported by:
    - `apps/prototypes/compare/fixture`
    - `apps/prototypes/compare/route`
- Core:
  - Exports (types):
    - `CompareHalf`
    - `CompareStatus`
  - Exports (values):
    - `COMPARE_HALF_ATTR`
    - `COMPARE_STATUS_ATTR`
    - `compareHalfSelector`
- Sub-plugins:
  - **`fixture`** — The fixture: counterpart kind for the prototype Compare stage: the real app component a prototype mocks, as a layout-harness fixture looked up by id (fixture:<id>) in this worktree's catalog and rendered live at the stage's shared width. The only place prototypes are tied to app internals.
  - **`route`** — The route: counterpart kind for the prototype Compare stage: the running app itself, framed chromeless (no rail, no tab bar) at an in-app path (route:/agents/c/123) on this deploy's own origin, so a whole-screen mock is compared against the real screen as this branch renders it — never a second implementation that could drift.

<!-- AUTOGENERATED:END -->
