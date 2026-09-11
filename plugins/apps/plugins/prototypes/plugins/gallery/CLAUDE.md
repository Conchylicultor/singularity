# gallery

The Prototypes app's two panes:

- **Gallery root pane** (`/prototypes`, no chrome) — a `DataView` gallery over the
  live `prototypesResource`. Each card shows the prototype's `<title>` + blurb
  over its rendered screenshot (`thumbnails`' `<PrototypeThumbnail>`; `name`
  stays the row key and the URL param — it is the directory name, which is a
  minted id); activating one pushes the detail pane. A "New prototype" button
  opens a `LaunchAgentPopover` that mints first (see below).

  `CoverSwatch` — the id-tinted gradient — stays here as the stand-in the
  thumbnail falls back to before its picture exists, or when rendering it
  failed. This pane owns the stand-in; `thumbnails` owns the picture.

  **Both resources are subscribed here, together** (`useCombinedResources` over
  `prototypesResource` + `usePrototypeThumbnails()`), and the cards wait for
  both. A resource primes over HTTP when its first subscriber mounts, so
  subscribing to the thumbnails down inside a card would put that request
  strictly after the list had painted — a guaranteed swatch-then-screenshot
  swap on every load. Side by side they prime in parallel, and the cover is
  right the first time it is painted.
- **Detail pane** (`proto/:name/:stage?`) — a switcher over **stages**, each a
  scaled live iframe surface.
  - **Nothing in it shows `name`.** `name` is a minted id
    (`proto-1786877040-w2vi`), so the header title and the iframe's accessible
    name both read the prototype's `<title>`. The header has to look that up in
    the live list, so it is a title NODE (`PrototypeTitle`), not a string, and it
    renders the loading state while the list is unknown rather than painting the
    id and swapping it out. The id does appear, monospaced, in the one case
    where it is the only true thing left to say: there is no such folder (or the
    list failed), so the prototype has no title to show.
  - **The pane header IS the action bar.** Every control in it (the stage
    switcher, the version stepper, Improve, and the sibling `present` plugin's
    Present menu) is a
    contribution to `prototypeDetailPane.Actions` — the standard pane extension
    point — so a new control is a contribution, never an edit to the pane body.
    The state those controls share lives in `PrototypeDetailProvider`
    (`context.tsx`), which wraps `PaneChrome` so the header renders inside it.
  - **The stage set is a slot too** (`PrototypeStages.Stage`, `slots.ts`). A
    stage is `{ id, label, order?, component }`; the component is handed
    `PrototypeStageProps` — the open prototype, the whole gallery list, and
    `src`, the prototype's document URL. The gallery contributes **Focus** like any sibling
    would, and names a stage nowhere else: the switcher's options ARE the
    contributions, and the body renders whichever one is active
    (`renderIsolated`). The sibling `compare` plugin contributes **Compare** —
    a prototype beside the real thing it mocks — exactly that way, with no
    edit here.

    A plain `defineSlot`, not `defineRenderSlot`: one stage paints at a time, so
    there is no list to render and nothing to reorder. It is the shape
    `defineTabbedView` uses internally, but that factory owns where the switcher
    sits (stacked directly above its body) and this one is a header action-bar
    contribution, several components away from the body it drives.
  - **Focus** (`focus-stage.tsx`) renders the prototype in a sandboxed iframe
    scaled to fit the pane (`ScaledIframe`: a ResizeObserver-driven
    `transform: scale()`, never upscaling past 1; the container owns the scaling
    box, the iframe is a rigid leaf), under a banner listing what is wrong with
    its folder. A new `src` (an edit's reload, a step of the version stepper)
    loads in a second, hidden frame on top of the one on screen and replaces it
    on `load` — a prototype renders client-side, so a frame navigating in place
    would be blank until its JSX had run. The frames are keyed by `src` with
    the incoming one rendered last, so promoting it only removes its
    predecessor and React never moves (and so reloads) the loaded frame.
  - The active stage is the URL's optional `:stage` — every stage has an
    address (`proto/<id>/compare`), and the bare `proto/<id>` (what the CLI
    prints) opens whichever stage sorts first. It is held as an **id**, so an id
    that does not resolve falls back to that first stage instead of blanking the
    pane. The switcher writes it with `useSetParams()`, which rewrites the URL
    of the SAME pane instance — a `swap` would remount the column and drop its
    maximize/collapse state on every switch.
  - **One URL for the open prototype: `usePrototypeSrc(meta, version)`.** It
    carries the live `prototypesVersionResource` value as a cache-bust (an
    agent's edit → version bump → new `src` → the iframe reloads) and the picked
    options. Stages get it as `src`, and Present's overlay and new-tab link call
    the hook, so no frame can show a different variant — a stage never composes
    a frame URL itself. When a recorded version is shown (below) it returns
    that version's frozen document instead (`prototypeVersionUrl`), with no
    picks and no cache-bust — which is how Focus, Compare's mock half and all
    four Present destinations follow the stepper without knowing it exists.
  - **Version stepper** (`version-stepper.tsx`, the `version` header action) —
    `‹ v3 of 7 ›` over `files`' per-prototype `prototypes.history` resource.
    The pane's only version state is `shownVersion` on the provider: a sha, or
    `null` for the live folder, held together with the prototype's name so
    opening another prototype shows it live without an effect resetting
    anything. Everything else — the stops, which one is on screen, what the
    arrows reach — is derived from the history on every render
    (`internal/version-steps.ts`, pure and unit-tested), so a version recorded
    or the folder turning dirty re-derives the stops under the reader instead
    of leaving a stale index.
    - The stops are the recorded versions, oldest first. When the folder is
      clean the newest one IS the live folder, labelled "Latest" (and showing
      it is `shownVersion = null`, so its frame still reloads on edits). When
      it is `dirty`, one more stop past the newest: "Live · unsaved", and the
      newest becomes an ordinary past version.
    - **The arrows never move.** The header shares its slack between the title
      and the spacer, so the group before the spacer (stage switcher +
      stepper) sits roughly centred, and ANY change of width in the header —
      even past the spacer — slides it. So the header keeps one width in every
      state: the label has a floor that fits every form (text centred), and
      nothing in the header appears or disappears as you step. Restore / Back
      to latest therefore live over the stage, not in the header (below). The
      e2e asserts the ‹ and › boxes are identical across steps.
    - A past version renders as it was saved: the options picker is hidden,
      because the options declared today may not exist in it. Its corner of
      the stage then holds the **past-version pill** (`past-version-pill.tsx`,
      rendered by `ReadyStage`, so it floats over every stage): "Viewing v3 ·
      <request> · 2h ago" with **Restore** and **Back to latest**. App DOM over
      the stage, never inside the prototype's page.
    - The label's tooltip is the version's request line and when it was made;
      clicking it opens the version list — a `DataView` (`prototypes.versions`,
      one list view, newest first) whose row action (`PrototypeVersionActions`,
      an item-actions slot) opens the conversation whose turn recorded it.
    - **Restore** is a `confirmDialog`, then the restore endpoint (the store
      saves the current state first, so nothing is lost), then back to live.
      `[` / `]` step back/forward — surface-scoped shortcuts, which as plain
      keys stay silent while a text field has focus.
    - Pending history renders disabled arrows over a loading label — never a
      "v0 of 0" that is really "not loaded yet".
  - **Options picker** (`options-picker.tsx`) — when the prototype declares
    `<meta name="prototype-option">` lines, a `FloatingAction` pill pinned to the
    stage's bottom-right corner shows the current values and expands on hover
    into one row of chips per option. It is app DOM over the stage, never in
    the prototype's page — that is what keeps switchers out of the designs.
    Chips, not a dropdown: a dropdown's portaled menu sits outside the hover box,
    so reaching for it would close the panel. Picks are remembered per
    prototype on this device (`useDraft`, scoped by name, on the provider) —
    living outside the frame is what makes them survive the reload every edit
    causes. `usePrototypePicks(meta)` resolves them against today's declaration
    (stale picks drop).
  - An "Improve" button opens a `LaunchAgentPopover` seeding `improveText(name)`,
    plus a line naming the picked options when any differ from the defaults —
    or, when a recorded version is on screen, a line naming that version (number
    and sha) and the `prototype restore` command that brings it back, since
    "make this darker" may be about v3 rather than the live folder.

Layout uses inline styles for the dynamic scaling geometry (not banned className
layout utilities).

## The two launch prompts

`newPrototypeText()` and `improveText()` are the only instruction guaranteed to
reach a prototype agent — they are always in its first user turn, unlike a
`CLAUDE.md` it may never open. So they carry the rules that decide whether the
result is an original design: **write to `~/.singularity/apps/prototypes/` and commit
nothing, edit the blank template in place, never open another prototype's
folder, never read `plugins/`**, keep the folder self-contained — and
**declare variants as options instead of building a switcher into the page**
(`OPTIONS_RULE`, `launch-rules.ts`; the owner chose this instruction, not a
check, as the guard).
`improveText()` also points at `./singularity prototype log <id> -p` — every
past version with its request and diff — so the agent can read how the design
got here instead of guessing from the current file.
Keep them tight and let `prototypes/CLAUDE.md` hold the rest — but do not let
them drift back into "follow the shape of the existing mocks", which is what
they said before and is why every prototype looked alike.

Both name the folder as a PATH, never as a name. It is a minted id, and
`` `proto-1786877040-w2vi` `` written as a name reads like something the agent
should live up to. What the prototype is called is its `<title>` — which
`newPrototypeText()` asks the agent to write, because until it does, the card
reads the template's own "Untitled prototype".

## New prototype mints before it launches

The New prototype button does not ask the agent to create anything. Its
`getRequest` is `async`: it `POST`s `createPrototype`, gets back a minted id, and
only then builds the prompt naming that folder. `getRequest` is awaited before
the conversation is created (`launch-control.tsx`), so this needs no change to
the launch primitive — and it is what makes the ordering safe.

A failed mint must not become a launch: `mintPrototypeFolder()` toasts the error
and re-throws, and that rejection is what stops `createConversation` from ever
running. So no agent is handed a prompt naming a folder that is not there. The
rejection also escapes to `window.onunhandledrejection`, which files a crash
report — deliberate, and why the toast is not a `catch` that ends there.

Accepted consequence: a card appears in the gallery the moment the button is
clicked, reading "Untitled prototype" until the agent's first save. It is
honest — the prototype does exist — and it self-corrects.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Prototypes gallery list pane and the detail pane whose stage set is a slot (Focus is its own contribution; Compare is a sibling plugin's), with an Improve this prototype affordance, the hover picker for a prototype's declared options (drawn by the app over the stage, never inside the page), and the ‹ v3 of 7 › stepper that points every stage at a recorded version and restores it.
- Web:
  - Slots:
    - `prototypesGalleryPane.Actions` ← `primitives.pane`
    - `prototypeDetailPane.Actions` ← `apps.prototypes.gallery`, `apps.prototypes.present`, `primitives.pane`
    - `PrototypeStages.Stage` ← `apps.prototypes.compare`, `apps.prototypes.gallery`
    - `PrototypeVersionActions` ← `apps.prototypes.gallery`
  - Contributes:
    - `Pane.Register` "prototypes-gallery"
    - `Pane.Register` "prototypes-detail"
    - `prototypeDetailPane.Actions` "view-mode" → `StageSwitcher`
    - `prototypeDetailPane.Actions` "version" → `VersionStepper`
    - `prototypeDetailPane.Actions` "improve" → `ImproveButton`
    - `PrototypeStages.Stage` "Focus" → `FocusStage`
    - `PrototypeVersionActions` "open-conversation" → `OpenVersionConversation`
  - Uses:
    - `apps-core/tabs.navigate`
    - `apps/prototypes/thumbnails.PrototypeThumbnail`
    - `apps/prototypes/thumbnails.usePrototypeThumbnails`
    - `infra/endpoints.fetchEndpoint`
    - `infra/endpoints.getEndpointErrorMessage`
    - `primitives/css/badge.Badge`
    - `primitives/css/clip.Clip`
    - `primitives/css/cluster.Cluster`
    - `primitives/css/column.Column`
    - `primitives/css/layer.layerClasses`
    - `primitives/css/line.Line`
    - `primitives/css/overlay.Overlay`
    - `primitives/css/pin.Pin`
    - `primitives/css/rigid.rigidClass`
    - `primitives/css/spacing.Inset`
    - `primitives/css/spacing.Stack`
    - `primitives/css/surface.Surface`
    - `primitives/css/text.Text`
    - `primitives/css/toggle-chip.SegmentedControl`
    - `primitives/css/toggle-chip.ToggleChip`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.ControlSizeProvider`
    - `primitives/css/yield.yieldClass`
    - `primitives/data-view.DataView`
    - `primitives/data-view.defineDataView`
    - `primitives/data-view.defineItemActions`
    - `primitives/data-view.FieldDef`
    - `primitives/data-view.FieldOption`
    - `primitives/data-view.ItemActionProps`
    - `primitives/dom/element-size.useElementSize`
    - `primitives/icon-button.IconButton`
    - `primitives/latest-ref.useEventCallback`
    - `primitives/launch.LaunchAgentPopover`
    - `primitives/link-gesture.linkGestureProps`
    - `primitives/live-state.matchResource`
    - `primitives/live-state.useCombinedResources`
    - `primitives/live-state.useResource`
    - `primitives/loading.Loading`
    - `primitives/overlay/floating-action.FloatingAction`
    - `primitives/overlay/floating-action.FloatingActionFadeIn`
    - `primitives/overlay/imperative-dialog/confirm.confirmDialog`
    - `primitives/overlay/popover.InlinePopover`
    - `primitives/pane.defineRoute`
    - `primitives/pane.Pane`
    - `primitives/pane.PaneChrome`
    - `primitives/pane.useOpenPane`
    - `primitives/persistent-draft.useDraft`
    - `primitives/relative-time.RelativeTime`
    - `primitives/shortcuts.useSurfaceShortcuts`
    - `primitives/slot-render.renderIsolated`
    - `shell/notifications.toast`
  - Exports (types):
    - `PrototypeDetailContextValue`
    - `PrototypeStage`
    - `PrototypeStageContribution`
    - `PrototypeStageProps`
  - Exports (values):
    - `prototypeDetailPane`
    - `prototypesGalleryPane`
    - `PrototypeStages`
    - `PrototypeVersionActions`
    - `ScaledIframe`
    - `usePrototypeDetail`
    - `usePrototypePicks`
    - `usePrototypeSrc`
- Cross-plugin:
  - Imported by:
    - `active-data/prototype`
    - `apps/prototypes/compare`
    - `apps/prototypes/present`

<!-- AUTOGENERATED:END -->
