# canvas

The prototype detail pane (`proto/:name`): one prototype shown as a
canvas of **lettered frames** — A, B, C… side by side — so a reader can put
two variants, two versions, or the mock and the real app next to each other
and look. Design: `research/2026-09-23-apps-prototypes-frame-canvas.md`
(mockup: prototype `proto-1790120832-wtfo`).

## The model

A frame shows one of two things:

- **the prototype** — one recorded version (or the live folder) under one set
  of option picks. Each prototype frame has its own version stepper in its
  header and its own options pill over its screen;
- **a frame source** — something that is not the prototype, contributed to
  the `FrameSource` slot (below). `compare` contributes the **Real app**: the
  real screen the prototype declares it mocks.

Everything else is **canvas-wide**: one size, one zoom, Whole page on or off,
and — with exactly two frames — Side by side or Swipe. Frames never have sizes
of their own, which is what makes them comparable.

`internal/canvas-model.ts` is the state as pure data, and `canvasReducer` is
the only way it changes. What the reducer cannot do itself — write the
prototype's shared picks record, which lives on the server — it returns as
**effects** (`setShared` / `resetShared` / `replaceShared`) that the provider
(`PrototypeDetailProvider`, `context.tsx`) runs. So every rule below is
unit-tested without a DOM or a server. `internal/layout.ts` (size, zoom, Whole
page and the measured room → each frame's logical size and scale) and
`internal/frame-name.ts` are pure and tested too.

The canvas belongs to ONE prototype: the provider holds it together with the
prototype's name, so opening another prototype opens its own canvas without an
effect resetting anything.

## Remembered per prototype

The detail pane's canvas is **remembered by the browser**, one localStorage
entry per prototype (`persistent-draft`, 30 days without a visit forgets it):
frames, their versions and own picks, selection, size, zoom, Whole page, Swipe,
link and spread. Reloading, or coming back to the prototype later, reopens it
as it was left. `dispatch` is the one place it changes, so it is the one place
it is written; the provider reads it synchronously when the canvas opens, so
the first paint is already the saved canvas.

Frame A's picks are not in it: A holds `"shared"`, a pointer to the server
record, which stays their only truth. `internal/saved-canvas.ts` validates what
it reads back (a zod schema plus the reducer's invariants — one `"shared"`
frame and it is A, ids below `nextId`, the selection on the canvas, Swipe with
two frames); anything else opens a fresh canvas with a console warning.

Remembering is opt-in (`remember` on `PrototypeDetailProvider`): only the
detail pane asks for it, never Present's one-frame page, and never inside an
embedded document — a framed copy of the app must not rewrite the host's
canvas. A reopened source frame whose plugin has not loaded yet (they load in
a later tier) reads `loading` in the dispatch fallback until the deferred tier
completes, and only then "nothing shows these frames".

## Frame A holds the shared picks

The option picks a person makes are, first of all, `files`' ONE shared record
per prototype (`prototypes.picks`, `_picks/<id>.json`): every tab, every
deploy and `./singularity prototype options <id>` see it, live. **Frame A** —
the first prototype frame — reads and writes that record. Every other
prototype frame holds picks of its own, local to this pane, so trying a variant
in B never changes what anyone else sees.

The invariant is kept by the reducer (`promoteA`): whenever a different frame
becomes A (A was closed, Keep only kept another frame, a spread put another
frame first), that frame's own picks are written to the shared record, so what
is on screen does not change; and the frame that stopped being A keeps what it
showed as picks of its own. Undo after Keep only puts back the record as it was.

The shared record is read through `useOptimisticResource`: a chip answers the
click at once, and a failed write stays on screen and shows in the sync-status
cloud. Until the record is known, no prototype frame renders its document
(`PicksRead` is pending) — a frame built on a guess would open the defaults
and then swap. Picks are judged per document: a frame's options are those its
own version declares (`documentOptions`), and a stored pick that version does
not declare is dropped from its URL.

## Frames: add, copy, link, spread, keep only, close

- **`+ Frame`** (header) adds a copy of the LAST prototype frame — same version,
  same picks — ready to change its variant or version. A frame's own
  **Duplicate** action copies that frame instead.
- **`+ <addLabel>`** — one button per frame source ("+ Real app"), disabled
  while that source is already on the canvas. The canvas names no source.
- **The options pill** ("Mist · Home +3") opens on click into "Options of B":
  one row of value chips per declared option, each value marked with the
  letters of the OTHER frames showing it. Per row:
  - **link** — keep this option the same in every frame; linking copies this
    frame's value everywhere, and later picks go to every frame;
  - **spread** — one frame per value of this option (the frame it was toggled
    from keeps its place, the others are copies of it with that one value
    changed); toggled again, it gathers back into that frame. A pick of the
    spread option breaks the spread.
  The pill is app DOM over the frame, never inside the prototype's page — that
  is what keeps switchers out of the designs.
- **Keep only** closes every other frame, with an Undo toast.
- **Close** removes one frame. The canvas never goes empty: with one frame
  left, Keep only and Close are not offered.

Frames are named from their picks (`frameName`): the values of the first two
options, plus any other option on which the frames differ — so two frames never
share a name while showing different things. A source frame is named by its
add label.

## Versions

Each prototype frame's header has `‹ v14 · latest ›` (`version-stepper.tsx`),
over `files`' per-prototype history resource. It moves only its own frame. The
stops are derived on every render from the history (`version-steps.ts`): the
recorded versions oldest first, the newest one being the live folder when it
is clean, plus a last "Live · unsaved" stop when the folder has changes no
version holds yet. The label opens the version list ("Versions of B", a
`DataView` whose row actions are the `PrototypeVersionActions` slot — the
canvas ships **Compare in a new frame** (a copy of this frame, same picks,
showing that version; the stepper hands the frame to its row actions through
`VersionListFrameContext`) and "open the conversation that recorded it"), and on a past version
it ends with **Make vN the latest** (confirm, restore, back to live; the store
saves the current state first, so nothing is lost).

**The arrows never move**: the label has a floor wide enough for every form,
so stepping never slides › out from under the pointer (`canvas-version.ts`
asserts it). Known gap: the stepper sits after the frame's name, and a version
that declares different options gets a different name, so stepping onto it can
shift the whole stepper (the script notes it rather than failing). A recorded version is a frozen document with no cache-bust; the
live folder is cache-busted by `prototypesVersionResource`, so an agent's edit
reloads it. A new `src` loads in a second, hidden iframe and replaces the one
on screen on `load` (`prototype-frame.tsx`), so a frame never blanks while a
client-rendered prototype boots.

## Size, zoom, Whole page

One chip in the canvas's bottom-right corner — "Desktop 1280 × 800 | Fit ·
62%" (`size-chip.tsx`) — opens the menu for all three:

- **Size** is the logical size every frame's page lays out at: **Responsive**
  (the default: a frame IS its share of the canvas, measured in page pixels at
  the current zoom — the page's own responsive layout shows), a **device
  preset** (Phone 480×900, Tablet 768×1024, Laptop 1024×640, Desktop 1280×800,
  Wide 1600×900 — a frame is that device's screen, and a longer page scrolls
  inside it), or **Custom** (a width dragged off the presets).
- **The drag handle** on a frame's right edge resizes EVERY frame (the size is
  canvas-wide), in 360–1920 px, snapping onto a preset it lands within 28 px of;
  a tip shows the width and the preset while dragging.
- **Zoom** is **Fit** (the default: the largest scale at which the whole frame
  is visible; at Responsive that is 100%) or a fixed scale from the 10–200%
  slider (with a detent at 100%). The value box beside the slider jumps to
  100%. Zoom never changes what the page lays out at — only how big it is
  painted (`transform: scale()`).
- **Whole page** shows each page's entire content instead of one screen: a
  frame is as tall as its document (measured once loaded,
  `use-page-height.ts`), all frames as tall as the tallest, and Fit then fits
  that whole height.

The layout is computed once by the canvas (`layoutFrames`) and handed to the
chip, so the chip and the frames can never disagree. Layout uses inline styles
only for this dynamic scaling geometry.

## Swipe, selection, keyboard

With exactly two frames the header offers **Side by side | Swipe**. Swipe
paints the two frames in one box, B under A, A clipped at a divider you drag.

Clicking a frame selects it (an accent ring; a new or changed frame becomes
selected). The selection is what the keys act on, registered once for the
canvas as surface-scoped plain keys (silent while a text field has focus):

- `[` / `]` step the selected frame's version;
- `0` toggles the zoom between 100% and Fit.

A selected frame shows its header actions; the others reveal them on hover.

## The URL

The URL names only the prototype: `proto/<id>` (what the CLI prints). What is
on its canvas is remembered by the browser (above), so the URL and the saved
canvas can never disagree about it. The route lives in `shell/core/routes.ts`,
so the gallery can open this pane without either plugin depending on the
other.

## Extension points

- **`prototypeDetailPane.Actions`** — the pane header IS the action bar. The
  canvas contributes the layout switch and the add buttons; `copy-id` the copy
  button; `gallery` the Done toggle. Order: `config/apps/prototypes/canvas/`.
- **`PrototypeFrameActions`** — a frame's header actions, handed
  `{ frame, meta }`. The canvas ships Keep only, Duplicate and Close; `present`
  adds its Present menu.
- **`FrameSource`** — a dispatch slot keyed on the source id: `{ match: "<id>",
  addLabel, component }`. The component is handed `{ source, meta, children }`
  and its only output is `children(resolution)` — `loading`, `unresolved
  { title, detail }` (prose, painted in the frame) or `found { tag, href?,
  render(width, height) }`. It paints no layout of its own, so a source frame is
  always the canvas's size; `render` runs inside an error boundary, so a
  crashing source costs its own frame only. An unknown id renders the
  `UnknownFrameSource` fallback.
- **`PrototypeVersionActions`** — row actions in the version list.

For surfaces that show a frame outside the pane (Present, its new-tab page)
the barrel exports `PrototypeDetailProvider` (standalone for one frame, with
`initialVersion` / `initialPicks`), `usePrototypeDetail`, `CanvasFrameView`
(the very same frame screen), `OptionsPill`, `VersionStepper`, `SizeChip`,
`layoutFrames` and `useFrameNames`.

## Driving it from outside: the DOM contract and e2e

Every frame's screen carries `data-canvas-frame="<letter>"`,
`data-canvas-frame-kind` (`prototype`, or the source's id — the canvas
publishes the id it was given) and `data-canvas-frame-status` (`loading` /
`unresolved` / `found`). The names and `canvasFrameSelector` live in `core/`,
the one spelling the canvas and an `e2e/` script both read.

`e2e/index.ts` holds the shared flows (open a canvas, add a source frame by
its add label, find a frame, read back
the size, version and picks its document was opened with — off the iframe's
`src` and box, so assertions are about what is on screen). The scripts, all
manual, default to the first prototype declaring an option with 3+ values and a
`mocks` counterpart (`--name` to choose):

- `canvas-frames.ts` — + Frame copies the last frame, B's picks are its own,
  link, spread and gather, Keep only + Undo, Close;
- `canvas-size.ts` — presets, Fit vs 100% and the slider, Whole page, drag
  snap;
- `canvas-version.ts` — the per-frame stepper moves only its frame, arrows
  stay put;
- `canvas-remember.ts` — a fresh browser opens A alone; frames, size and zoom
  come back on reopening, the URL never changes, a closed frame stays closed.

Each script's session is a fresh browser context, so it starts from nothing
remembered.

`compare/e2e/compare-diff.ts` photographs frame A against the real-app frame.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The prototype detail pane as a canvas of lettered frames: the prototype (frame A reads and writes the shared option picks, every other frame holds its own), each with its own version stepper and options pill, beside frames from contributed sources (FrameSource — the real app, from compare); one canvas-wide size & zoom chip (Responsive / device presets / custom, Fit or 10–200%, Whole page), a drag handle that resizes every frame and snaps to the presets, side-by-side or swipe, keep-only with Undo, link and spread across frames; the whole canvas is remembered by the browser per prototype, so a reload reopens it as it was left.
- Web:
  - Slots:
    - `prototypeDetailPane.Actions` ← `apps.prototypes.canvas`, `apps.prototypes.copy-id`, `apps.prototypes.gallery`, `primitives.pane`
    - `PrototypeFrameActions` ← `apps.prototypes.canvas`, `apps.prototypes.present`
    - `FrameSource` ← `apps.prototypes.compare`
    - `PrototypeVersionActions` ← `apps.prototypes.canvas`
  - Contributes:
    - `Pane.Register` "prototypes-detail"
    - `prototypeDetailPane.Actions` "layout" → `LayoutAction`
    - `prototypeDetailPane.Actions` "add" → `AddFrameActions`
    - `PrototypeFrameActions` "keep-only" → `KeepOnlyFrameAction`
    - `PrototypeFrameActions` "duplicate" → `DuplicateFrameAction`
    - `PrototypeFrameActions` "close" → `CloseFrameAction`
    - `PrototypeVersionActions` "compare" → `CompareVersionAction`
    - `PrototypeVersionActions` "open-conversation" → `OpenVersionConversation`
  - Uses:
    - `apps-core/tabs.navigate`
    - `infra/endpoints.fetchEndpoint`
    - `primitives/css/badge.Badge`
    - `primitives/css/center.Center`
    - `primitives/css/cluster.Cluster`
    - `primitives/css/column.Column`
    - `primitives/css/control-panel.ControlPanel`
    - `primitives/css/control-panel.ControlPanelPopover`
    - `primitives/css/coords.Placed`
    - `primitives/css/fill.Fill`
    - `primitives/css/layer.layerClasses`
    - `primitives/css/line.Line`
    - `primitives/css/pin.Pin`
    - `primitives/css/rigid.rigidClass`
    - `primitives/css/scroll.Scroll`
    - `primitives/css/slider.Slider`
    - `primitives/css/spacing.Inset`
    - `primitives/css/spacing.Stack`
    - `primitives/css/sticky.Sticky`
    - `primitives/css/text.Text`
    - `primitives/css/toggle-chip.SegmentedControl`
    - `primitives/css/toggle-chip.ToggleChip`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.ControlSizeProvider`
    - `primitives/data-view.DataView`
    - `primitives/data-view.defineDataView`
    - `primitives/data-view.defineItemActions`
    - `primitives/data-view.FieldDef`
    - `primitives/data-view.FieldOption`
    - `primitives/data-view.ItemActionProps`
    - `primitives/dom/element-size.useElementSize`
    - `primitives/dom/element-size.useResizeObserver`
    - `primitives/embed.isEmbeddedDocument`
    - `primitives/error-boundary.PluginErrorBoundary`
    - `primitives/hover-reveal.hoverRevealGroup`
    - `primitives/hover-reveal.hoverRevealTarget`
    - `primitives/icon-button.IconButton`
    - `primitives/latest-ref.useEventCallback`
    - `primitives/link-gesture.linkGestureProps`
    - `primitives/live-state.matchResource`
    - `primitives/live-state.useCombinedResources`
    - `primitives/live-state.useResource`
    - `primitives/loading.Loading`
    - `primitives/optimistic-mutation.useOptimisticResource`
    - `primitives/overlay/imperative-dialog/confirm.confirmDialog`
    - `primitives/overlay/popover.InlinePopover`
    - `primitives/pane.Pane`
    - `primitives/pane.PaneChrome`
    - `primitives/persistent-draft.readDraft`
    - `primitives/persistent-draft.writeDraft`
    - `primitives/relative-time.RelativeTime`
    - `primitives/shortcuts.useSurfaceShortcuts`
    - `primitives/slot-render.defineDispatchSlot`
    - `shell/toast.showToast`
  - Exports (types):
    - `CanvasAction`
    - `CanvasFrame`
    - `CanvasFrameViewProps`
    - `CanvasLayout`
    - `CanvasSize`
    - `CanvasSourceEntry`
    - `CanvasState`
    - `CanvasZoom`
    - `FrameActionRow`
    - `FrameId`
    - `FrameLayout`
    - `FrameResolution`
    - `FrameSourceMeta`
    - `FrameSourceProps`
    - `PicksRead`
    - `PresetName`
    - `PrototypeDetailContextValue`
    - `PrototypeFrame`
    - `Room`
    - `SourceFrame`
    - `VersionStepperProps`
  - Exports (values):
    - `CanvasFrameView`
    - `documentOptions`
    - `frameA`
    - `FrameLetter`
    - `FrameSource`
    - `layoutFrames`
    - `letterOf`
    - `OptionsPill`
    - `prototypeDetailPane`
    - `PrototypeDetailProvider`
    - `prototypeDocumentSrc`
    - `PrototypeFrameActions`
    - `prototypeFrames`
    - `PrototypeVersionActions`
    - `roomPerFrame`
    - `SIZE_PRESETS`
    - `SizeChip`
    - `useFrameNames`
    - `useFramePicks`
    - `useFrameSrc`
    - `usePrototypeDetail`
    - `VersionStepper`
- Cross-plugin:
  - Imported by:
    - `active-data/prototype`
    - `apps/prototypes/compare`
    - `apps/prototypes/copy-id`
    - `apps/prototypes/gallery`
    - `apps/prototypes/present`
    - `conversations/conversation-view/artifacts/prototype`
- Core:
  - Exports (types): `CanvasFrameStatus`
  - Exports (values):
    - `CANVAS_FRAME_ATTR`
    - `CANVAS_FRAME_KIND_ATTR`
    - `CANVAS_FRAME_STATUS_ATTR`
    - `canvasFrameSelector`
    - `PROTOTYPE_FRAME_KIND`

<!-- AUTOGENERATED:END -->
