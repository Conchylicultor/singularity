# element-picker

Toolbar button (`MdAdsClick`, "Pick UI element") that mounts a full-screen
Chrome-inspector-style overlay on the live app. The user hovers (a highlight box
tracks the element under the pointer) and clicks any element; its metadata —
the full plugin/slot **composition lineage**, containing pane, current URL, and a
fine-grained element descriptor (tag + role + accessible label + an id/test-id
anchored CSS path) — is captured, serialized to a single-line
`<ui-context …>…</ui-context>` tag, and inserted into the Improve draft via
`insertIntoImproveDraft`. There it renders as a rich inline chip, and on submit the
tag flows verbatim into the agent prompt. The **same** chip renders wherever the
tag later appears (the sent user message, assistant text) because it is just an
`active-data` inline contribution — one registry, every surface (see below).

## How the pieces fit

- **The lineage lives in `primitives/ui-context`.** The node model, the DOM
  attribute grammar, the portal-crossing chain helpers, the `collectLineage`
  walk, the `<UiRegion>` region producer, the `<ui-context>` token
  (`serializeUiContext` / `parseUiContext` / `UI_CONTEXT_FIELDS`) and
  `collectMeta` all live there — a neutral leaf, so `reports/render-loop` can ask
  "what composed this element?" without depending on the Improve app's subtree.
  Read that plugin's `CLAUDE.md` for the grammar, the portal bridge, and why
  regions must supply their own position.
- **What element-picker still owns: the interaction, and ONE producer.**
  `internal/marker-middleware.tsx` registers `contributionNodeAttrs`
  (`data-lineage="contribution"` + `data-plugin-id` / `data-slot-id` /
  `data-contribution-id`) with `registerSlotItemAttrs`, and slot-render stamps
  them on the one box it draws around each contribution — see `slot-render`'s
  "The contribution box, and stamping it". Attributes, not a wrapper: the wrapper
  this used to be sat inside the layout cell a row slot draws, so a pick anywhere
  in the slack between a small widget and the edge of its cell climbed past the
  whole contribution to the enclosing pane. The middleware that remains renders
  no element — it only appends the same node to the portal-forward bridge, which
  needs a provider.
  It stays **here, opt-in, on purpose**: it describes *every* slot contribution
  repo-wide, so that cost should only be paid when the picker is in the app
  composition. The other producer, `<UiRegion>` (a handful of explicit call
  sites — miller columns, full-pane), has no such constraint and is unconditional
  in the primitive.
- **Overlay.** `picker-overlay.tsx` is a `fixed inset-0 z-max` portal with
  `pointer-events:none` so `document.elementFromPoint` returns the real
  underlying element. Window capture-phase `mousemove`/`click`/`keydown` track
  the hovered element, select on click (`preventDefault`+`stopPropagation`), and
  cancel on Esc. Targets inside `[data-element-picker]` are skipped.
- **Hit-testing ignores `pointer-events`** (`internal/resolve-target.ts`).
  `elementFromPoint` answers "what would receive a click here?" — the app's
  interactivity policy — but picking is inspection. Disabled controls, icon
  glyphs and click-through layers are invisible to it and mis-resolve to their
  nearest interactive *ancestor*, so it only **seeds** the search: descend to the
  deepest visible descendant containing the point. `<svg>` subtrees are not
  descended into (the glyph stands in for its host control); boxless
  (`display:contents`) marker spans are traversed, never selected. `PickerButton`
  stays `disabled` while armed on purpose: picking its own (non-hit-testable)
  button each e2e run is the live regression test for this.
- **Rich chip.** `components/ui-context-tag.tsx` is an `active-data` **inline
  chip** (`ActiveData.Tag(inlineChip({ id: "ui-context", pattern: UI_CONTEXT_RE,
  surfaces: ["transcript"], … }))`): it parses the matched
  `<ui-context>…</ui-context>` substring back into metadata and renders
  `UiContextChip`. This is the *only* registration — `active-data` renders
  inline chips on every text surface of that kind, including the Lexical prompt
  editor (via its generic `ActiveDataInlineNode`) and read surfaces (markdown /
  user-text `useActiveDataLinkify`). The token is single-line so it round-trips
  through the editor's line-based markdown sync; copy/paste survives because the
  generic node emits the raw tag as its text content. There is no
  element-picker-owned Lexical node — declaring the one chip lights it up
  everywhere.

  **`surfaces: ["transcript"]`, deliberately.** A `<ui-context>` tag points at a
  live UI element captured for one agent turn; it is addressed to the model
  reading that conversation and means nothing in a page a person wrote. The chip
  declaring that is what keeps it out of Pages — no page-side consumer names
  this plugin.

## Token format

Owned by `primitives/ui-context` (`core/internal/token.ts`) — see its
`CLAUDE.md` for the wire format and the field registry.

Two of its fields are stamped by **this** plugin's build transform
(`vite/index.ts`), so they exist only when the picker is in the composition:

- `source` — repo-relative `file:line` of the **leaf** host element where the JSX
  tag is literally written (`data-source` on host elements).
- `owner` — `Name@file:line` of the nearest **semantic** component that owns the
  element (`data-ui-owner` prepended on component callsites, so it rides the
  composed primitive's `{...props}` spread and base-ui's `data-*` forwarding onto
  the host). This names the *composing* component (e.g. `LaunchControl`) for
  picks where it authors no host element of its own and is not a slot
  contribution — exactly the case `source` (a leaf primitive) and
  `plugin`/`contribution` (the outer slot wrapper) both miss. Omitted when the
  element doesn't flow through a prop-forwarding primitive.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Chrome-inspector-style 'pick a UI element' toolbar button. Overlays the live app to hover/click any element, captures its plugin/slot/pane/URL metadata, and hands a readable <ui-context/> tag to the Improve popover as a rich inline chip.
- Web:
  - Contributes:
    - `ActionBar.Item` → `ElementPickerButton`
    - `TaskDraftFormSlots.Action` → `TaskDraftPickerButton`
    - `ActiveData.Tag` "ui-context" → `UiContextTag`
  - Uses:
    - `active-data.ActiveData`
    - `active-data.inlineChip`
    - `improve.insertIntoImproveDraft`
    - `primitives/css/coords.Placed`
    - `primitives/css/coords.placedClasses`
    - `primitives/css/coords.placedStyle`
    - `primitives/css/fill.Fill`
    - `primitives/css/fill.fillClasses`
    - `primitives/css/inline.Inline`
    - `primitives/css/pin.Pin`
    - `primitives/css/rigid.rigidClass`
    - `primitives/css/spacing.Inset`
    - `primitives/css/spacing.insetClass`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.PortalForwardProvider`
    - `primitives/css/ui-kit.SingleLineProvider`
    - `primitives/css/ui-kit.usePortalForwardedAttrs`
    - `primitives/css/viewport-overlay.ViewportOverlay`
    - `primitives/icon-button.IconButton`
    - `primitives/overlay/popover.InlinePopover`
    - `primitives/slot-render.registerSlotItemAttrs`
    - `primitives/slot-render.registerSlotItemMiddleware`
    - `primitives/ui-context.appendLineage`
    - `primitives/ui-context.collectLineage`
    - `primitives/ui-context.collectMeta`
    - `primitives/ui-context.contributionNodeAttrs`
    - `primitives/ui-context.LINEAGE_ATTR`
    - `shell/action-bar.ActionBar`
    - `tasks/task-draft-form.TaskDraftFormSlots`
- Core:
  - Uses: `framework/tooling/collected-dir.defineCollectedDir`
  - Exports (values): `viteCollectedDir`

<!-- AUTOGENERATED:END -->
