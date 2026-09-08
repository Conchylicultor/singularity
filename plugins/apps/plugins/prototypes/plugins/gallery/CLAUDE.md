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
- **Detail pane** (`proto/:name`) — a switcher over **stages**, each a scaled live
  iframe surface.
  - **Nothing in it shows `name`.** `name` is a minted id
    (`proto-1786877040-w2vi`), so the header title and the iframe's accessible
    name both read the prototype's `<title>`. The header has to look that up in
    the live list, so it is a title NODE (`PrototypeTitle`), not a string, and it
    renders the loading state while the list is unknown rather than painting the
    id and swapping it out. The id does appear, monospaced, in the one case
    where it is the only true thing left to say: there is no such folder (or the
    list failed), so the prototype has no title to show.
  - **The pane header IS the action bar.** Every control in it (the stage
    switcher, Improve, and the sibling `present` plugin's Present menu) is a
    contribution to `prototypeDetailPane.Actions` — the standard pane extension
    point — so a new control is a contribution, never an edit to the pane body.
    The state those controls share lives in `PrototypeDetailProvider`
    (`context.tsx`), which wraps `PaneChrome` so the header renders inside it.
  - **The stage set is a slot too** (`PrototypeStages.Stage`, `slots.ts`). A
    stage is `{ id, label, order?, component }`; the component is handed
    `PrototypeStageProps` — the open prototype, the whole gallery list, and the
    cache-bust version. The gallery contributes **Focus** and **Compare** like
    any sibling would, and names a stage nowhere else: the switcher's options
    ARE the contributions, and the body renders whichever one is active
    (`renderIsolated`). So a third stage — a prototype beside the real component
    it mocks, say — is a new plugin folder and no edit here.

    A plain `defineSlot`, not `defineRenderSlot`: one stage paints at a time, so
    there is no list to render and nothing to reorder. It is the shape
    `defineTabbedView` uses internally, but that factory owns where the switcher
    sits (stacked directly above its body) and this one is a header action-bar
    contribution, several components away from the body it drives.
  - **Focus** (`focus-stage.tsx`) renders the prototype in a sandboxed iframe
    scaled to fit the pane (`ScaledIframe`: a ResizeObserver-driven
    `transform: scale()`, never upscaling past 1; the container owns the scaling
    box, the iframe is a rigid leaf), under a banner listing what is wrong with
    its folder.
  - **Compare** (`compare-stage.tsx`) renders a horizontally-scrolling row of
    scaled iframes, one per prototype; clicking one swaps the pane to it.
  - The active stage is state on the provider, held as an **id** — so a picked
    stage survives the contribution list changing under it, and an id that no
    longer resolves falls back to whichever stage sorts first instead of
    blanking the pane.
  - Every iframe `src` carries the live `prototypesVersionResource` value as a
    cache-bust, so an agent's edit (watcher → version bump → re-render) reloads
    the iframe automatically.
  - An "Improve" button opens a `LaunchAgentPopover` seeding `improveText(name)`.

Layout uses inline styles for the dynamic scaling geometry (not banned className
layout utilities).

## The two launch prompts

`newPrototypeText()` and `improveText()` are the only instruction guaranteed to
reach a prototype agent — they are always in its first user turn, unlike a
`CLAUDE.md` it may never open. So they carry the rules that decide whether the
result is an original design: **write to `~/.singularity/apps/prototypes/` and commit
nothing, edit the blank template in place, never open another prototype's
folder, never read `plugins/`**, keep the folder self-contained.
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

- Description: Prototypes gallery list pane and the detail pane whose stage set is a slot (Focus and Compare are its own two contributions), with an Improve this prototype affordance.
- Web:
  - Slots:
    - `prototypesGalleryPane.Actions` ← `primitives.pane`
    - `prototypeDetailPane.Actions` ← `apps.prototypes.gallery`, `apps.prototypes.present`, `primitives.pane`
    - `PrototypeStages.Stage` ← `apps.prototypes.compare-component`, `apps.prototypes.gallery`
  - Contributes:
    - `Pane.Register` "prototypes-gallery"
    - `Pane.Register` "prototypes-detail"
    - `prototypeDetailPane.Actions` "view-mode" → `StageSwitcher`
    - `prototypeDetailPane.Actions` "improve" → `ImproveButton`
    - `PrototypeStages.Stage` "Focus" → `FocusStage`
    - `PrototypeStages.Stage` "Compare" → `CompareStage`
  - Uses:
    - `apps/prototypes/thumbnails.PrototypeThumbnail`
    - `apps/prototypes/thumbnails.usePrototypeThumbnails`
    - `infra/endpoints.fetchEndpoint`
    - `infra/endpoints.getEndpointErrorMessage`
    - `primitives/css/badge.Badge`
    - `primitives/css/column.Column`
    - `primitives/css/overlay.Overlay`
    - `primitives/css/pin.Pin`
    - `primitives/css/spacing.Inset`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/toggle-chip.SegmentedControl`
    - `primitives/css/ui-kit.Button`
    - `primitives/data-view.DataView`
    - `primitives/data-view.defineDataView`
    - `primitives/data-view.FieldDef`
    - `primitives/dom/element-size.useElementSize`
    - `primitives/launch.LaunchAgentPopover`
    - `primitives/live-state.matchResource`
    - `primitives/live-state.useCombinedResources`
    - `primitives/live-state.useResource`
    - `primitives/loading.Loading`
    - `primitives/pane.defineRoute`
    - `primitives/pane.Pane`
    - `primitives/pane.PaneChrome`
    - `primitives/pane.useOpenPane`
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
    - `ScaledIframe`
    - `usePrototypeDetail`
- Cross-plugin:
  - Imported by:
    - `active-data/prototype`
    - `apps/prototypes/compare-component`
    - `apps/prototypes/present`

<!-- AUTOGENERATED:END -->
