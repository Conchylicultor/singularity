# element-picker

Toolbar button (`MdAdsClick`, "Pick UI element") that mounts a full-screen
Chrome-inspector-style overlay on the live app. The user hovers (a highlight box
tracks the element under the pointer) and clicks any element; its metadata —
the full plugin/slot **composition lineage**, containing pane, current URL, and a
fine-grained element descriptor (tag + role + accessible label + an id/test-id
anchored CSS path) — is captured, serialized to a single-line
`<ui-context …>…</ui-context>` tag, and handed to the Improve popover via
`Improve.OpenWithText`. There it renders as a rich inline chip, and on submit the
tag flows verbatim into the agent prompt. The **same** chip renders wherever the
tag later appears (the sent user message, assistant text) because it is just an
`active-data` inline contribution — one registry, every surface (see below).

## How the pieces fit

- **DOM → plugin mapping.** `internal/marker-middleware.tsx` registers a
  slot-item middleware (`registerSlotItemMiddleware`) that wraps every
  contribution in a layout-neutral `<span style="display:contents"
  data-plugin-id data-slot-id>`. `display:contents` adds no box (layout is
  unchanged) but keeps the element in the DOM tree. `internal/marker-lineage.ts`
  walks the **whole** nested `[data-plugin-id]` chain (not just the nearest), so
  the captured `path` is the full composition lineage — who contributes into
  whose slot, outer→inner — which points at the contributing source far more
  precisely than the innermost plugin id alone. `data-pane-id` is added at the
  layout pane-render chokepoints (miller / full-pane) so the lineage walk can
  also report the containing pane.
- **Surviving portals.** Popovers, dialogs, menus, and the viewport overlay
  relocate their content to `document.body`, which severs it from the
  `[data-plugin-id]` marker spans (those stay in the source tree) — so a naive
  DOM-ancestry walk loses the whole lineage for portaled UI. The marker
  middleware therefore *also* appends each marker to the **portal-forward bridge**
  (`primitives/css/ui-kit`'s `PortalForwardProvider` / `usePortalForwardedAttrs`),
  a React-context bag of `data-*` attributes that crosses portals; every portal
  surface re-stamps the bag onto its positioner. The serialized chain rides as
  `data-plugin-lineage` (see `marker-lineage.ts`), and `collectMarkerLineage`
  splices it in when the walk hits a portaled positioner. This is the same generic
  bridge theme scope (`data-theme-scope`) and pane id (`data-pane-id`) ride — add a
  forwarded signal once, every portal surface carries it. Without it, picks inside
  a popover reported `source`/`owner` (build-stamped on the element) but no
  `plugin`/`slot`/`path`.
- **Overlay.** `picker-overlay.tsx` is a `fixed inset-0 z-max` portal with
  `pointer-events:none` so `document.elementFromPoint` returns the real
  underlying element. Window capture-phase `mousemove`/`click`/`keydown` track
  the hovered element, select on click (`preventDefault`+`stopPropagation`), and
  cancel on Esc. Targets inside `[data-element-picker]` are skipped.
- **Rich chip.** `components/ui-context-tag.tsx` is an `active-data` **inline
  contribution** (`ActiveData.Tag`, `display:"inline"`, pattern `UI_CONTEXT_RE`):
  it parses the matched `<ui-context>…</ui-context>` substring back into metadata
  and renders `UiContextChip`. This is the *only* registration — `active-data`
  renders inline contributions on every text surface, including the Lexical
  editor (via its generic `ActiveDataInlineNode` bridge into
  `TextEditorSlots.NodeExtensions`) and read surfaces (markdown / user-text
  `useActiveDataLinkify`). The token is single-line so it round-trips through the
  editor's line-based markdown sync; copy/paste survives because the generic node
  emits the raw tag as its text content. There is no element-picker-owned Lexical
  node — registering the one inline contribution lights the chip up everywhere.

## Token format

`UI_CONTEXT_RE`. The tag is a **paired** element following the standard XML
split — structured machine coordinates in attributes, human/model-readable
prose in the body, itself split into two sibling tags:

```
<ui-context url="…" plugin="…" slot="…" contribution="…" pane="…" path="…" selector="…" source="…" owner="…"><hint>The user pointed at this element in the live app using the element-picker inspector; it is the UI element their request refers to.</hint><picked-content><element label></picked-content></ui-context>
```

The tag flows **verbatim into the agent prompt**, so the body carries a fixed
`<hint>` (constant `HINT` string) explaining *what the tag is and how the user
produced it* — an agent reading it cold shouldn't have to infer that from a bag
of attributes — kept **separate** from the `<picked-content>` element label so
the model never has to disentangle framing from data. `plugin`/`slot`/
`contribution`/`pane`/`path`/`selector`/`source`/`owner` attributes are omitted when
absent; `path` carries the outer→inner lineage `plugin@Slot > plugin@Slot` and is
only emitted when it adds more than the innermost plugin/slot. `contribution`
carries the innermost slot contribution's stable `pluginId:id` key (the
author-supplied contribution id), sharpening slot-boundary picks. `source` carries
the repo-relative `file:line` of the picked element's source — the **leaf** host
element where the JSX tag is literally written — stamped onto host DOM elements by
the source-location build transform (available only when that transform is active,
i.e. when the element-picker plugin is part of the app composition). `owner`
carries `Name@file:line` of the nearest **semantic** component that owns the picked
element — stamped by injecting `data-ui-owner` on component (uppercase) JSX
callsites, which rides the composed primitive's `{...props}` spread (and base-ui's
`data-*` forwarding) onto the host element. This names the *composing* component
(e.g. `LaunchControl`) for picks where it authors no host element of its own and is
not a slot contribution — exactly the case `source` (a leaf primitive like
`button-group.tsx`) and `plugin`/`contribution` (the outer slot wrapper) both miss.
`owner` is omitted when the picked element doesn't flow through a prop-forwarding
primitive (graceful fallback to `source`). Attribute values and the picked label are
sanitized to be quote/angle-bracket/newline-free (the only `<` in the body are
the two nested body tags themselves) so the tag stays single-line and
round-trippable through the editor's line-based markdown sync. `parseUiContext`
still reads pre-split legacy flat-body tags (`LEGACY_BODY_PREAMBLE`).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Chrome-inspector-style 'pick a UI element' toolbar button. Overlays the live app to hover/click any element, captures its plugin/slot/pane/URL metadata, and hands a readable <ui-context/> tag to the Improve popover as a rich inline chip.
- Web:
  - Contributes:
    - `ActionBar.Item` → `ElementPickerButton`
    - `TaskDraftFormSlots.Action` → `TaskDraftPickerButton`
    - `ActiveData.Tag` "<ui-context(?:\s+[\w-]+="[^"]*")*\s*>[\s\S]*?<\/ui-context>" → `UiContextTag`
  - Uses:
    - `active-data.ActiveData`
    - `improve.openImproveWithText`
    - `primitives/css/pin.Pin`
    - `primitives/css/spacing.Inset`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.PortalForwardProvider`
    - `primitives/css/ui-kit.usePortalForwardedAttrs`
    - `primitives/css/viewport-overlay.ViewportOverlay`
    - `primitives/icon-button.IconButton`
    - `primitives/popover.InlinePopover`
    - `primitives/slot-render.registerSlotItemMiddleware`
    - `shell/action-bar.ActionBar`
    - `tasks/task-draft-form.TaskDraftFormSlots`
- Core:
  - Uses: `framework/tooling/collected-dir.defineCollectedDir`
  - Exports (types):
    - `UiContextField`
    - `UiContextMeta`
  - Exports (values):
    - `parseUiContext`
    - `serializeUiContext`
    - `UI_CONTEXT_FIELDS`
    - `UI_CONTEXT_RE`
    - `viteCollectedDir`

<!-- AUTOGENERATED:END -->
