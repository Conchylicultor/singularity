# callout

A callout is a **void container**. Its payload is `{icon, iconSvgNodes, color}`
and nothing else — no `text`. Its content IS its children, which are ordinary
blocks of any type that do not know they are inside it:

```
Callout            ← the anchor: appearance only, no line of its own
├── Text  "first line"
├── Heading
└── Bulleted list
```

That is the whole design, and every reported bug was a symptom of the previous
model, in which one row played container identity, appearance AND the first line
of content at once. Enter made a second callout (making another content line
meant making another container); converting the line to a heading destroyed the
box (the line's type *was* the container's identity). Neither is expressible now.

## Three responsibilities, three declarations

- **The handle** (`core/callout-block.ts`) states the container facts the editor
  core reads generically. `acceptsText` is *derived* from the schema
  (`"text" in schema.shape`), so dropping `textBlockSchema` is what makes the
  block void — there is no separate flag to disagree with the payload, and the
  write boundary's strict parse rejects a stray `text` outright.
  - `anchor: true` — this type renders no line. The surface collapses its row to
    zero height while it has visible children and paints its decoration in the
    indent gutter; the pure reducer reads the same fact (`BlockOpContext.anchorTypes`)
    for the split/merge refusals and the childless-anchor prune. It lives in
    `core` because the server has no slots.
  - `wrapOnConvert: true` — `/callout` on an existing block **wraps** it instead
    of retyping it: the origin keeps its id, type, `data` and children and
    becomes the anchor's first child; a new row is minted for the anchor. Keeping
    the origin id is what keeps the caret still (its content `Y.Doc`, its
    `Y.UndoManager` and its registered focus handle are all keyed by block id),
    and not retyping it is what makes `/callout` work on a heading, to-do, image
    or code block for free.
  - `collapsible: "never"` — an anchor has no chevron, so a stored
    `expanded: false` (which `applySplit`, `applyInsert` and any patch replay all
    mint) would hide its children behind nothing. The flatten ignores the flag for
    these types; making it *inert* is a guarantee, "every creation path sets it
    true" is not.

- **The frame** (`web/components/callout-frame.tsx`) paints the tint, over the
  anchor's row plus its whole visible subtree. A block renderer cannot do this
  itself: both surfaces render the forest as a flat list of sibling rows so a
  structural move only reorders keyed elements, which means a block's children are
  not its DOM children. `Editor.BlockFrame` is the seam for the other half — see
  `page/editor`'s `internal/block-frames.ts`. Contributing one is also what *makes*
  the callout a container: the framed-type set is derived from that slot's
  registered matches (`useFramedBlockTypes()`), so there is no second "I am a
  container" flag to drift from who actually paints a box.

  The frame owns the tint and nothing else. It must never add horizontal padding
  or a left border **to the flow**: the rows inside seat their hover controls
  against a content edge the *surface* computed, so shifting the flow sideways
  would strand them. The box starts at the `inset` prop — the editor's
  already-resolved content edge `C`, which is why the tint bleeds to `C` rather
  than `C + BLOCK_INSET`.

- **The anchor** (`web/components/callout-anchor.tsx`) is the icon, and it rides
  on the *same* `Editor.BlockFrame` registration (`BlockFrameMeta.anchor`) so a
  type cannot claim anchorhood without actually registering as a container.
  `./singularity check page-editor:anchor-has-decoration` pins the two halves
  together — a handle declaring `anchor: true` whose plugin supplies no component
  is an invisible container, not a cosmetic gap.

  The anchor renders appearance + interaction ONLY. The surface owns its
  geometry: a `BLOCK_INDENT`-wide column at `C`, seated on the first visible
  child's borrowed first-line centre (an anchor has no line of its own to
  measure), and the drag listeners. It must not position or size itself.

## The icon popover carries the whole block-actions menu

An anchor row renders **no hover rail**. Its three gutter slots would be
identical to its first child's, on the same visual line, and the child must keep
its own handle — so there is nowhere to hang a `BlockActionsMenu` off. Everything
an ordinary block gets from that handle therefore lives on the icon: the surface
gives it drag-to-move, and the popover carries colour, icon, Reset, plus the two
structural actions.

**Remove callout** and **Delete** are different intents and must stay separate.
Remove dissolves the box and promotes the children into its slot (the `unwrap`
reducer op) — the escape hatch that keeps the content, and the same thing
Backspace at the start of the first child resolves to. Delete removes the
container *with* its subtree, exactly as any other block's Delete does.

The trigger `preventDefault`s its mousedown (the click lands beside a live
caret), and commits fire on `onMouseDown` — the same shape `BlockActionsMenu`
uses, for the same reason.

## What is deliberately NOT here

There is no callout-specific keystroke handling, and that is the point. Enter in
a child is an ordinary sibling split; Tab / Shift+Tab nest and un-nest with no
callout logic; arrow navigation skips the anchor because it registers no focus
handle; converting a child's type can never reach the container. The single
callout-shaped rung in the generic ladder is `unwrap` — Backspace at the start of
an anchor's first child — and it exists because the generic `isIndented` → outdent
rung would pop that child out *and adopt the remaining siblings as its children*,
silently re-nesting content nobody asked to nest.

The `Editor.Block` contribution is kept with a **null renderer**
(`CalloutNoRow`). `BlockRow`'s anchored branch never dispatches that slot for an
`anchor` type, so it is unreachable — but the registration is where the HANDLE
lives, and the handle is what the insert palette, markdown, paste, the turn-into
list and the reducer's `anchorTypes` all read.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Callout block type: a void CONTAINER whose tinted box wraps blocks of any type nested inside it, with a changeable leading icon and semantic color, for notes/tips/warnings. Callout block type: registers its `data` schema (icon + semantic color) at the server write boundary.
- Web:
  - Contributes:
    - `Editor.Block` "callout" → `CalloutNoRow`
    - `Editor.BlockFrame` "callout" → `CalloutFrame`
  - Uses:
    - `page/editor.BlockAnchorProps`
    - `page/editor.BlockEditorAPI`
    - `page/editor.Editor`
    - `page/editor.PageIcon`
    - `page/editor.useBlockEditor`
    - `primitives/css/center.Center`
    - `primitives/css/row.Row`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.SectionLabel`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.Popover`
    - `primitives/css/ui-kit.PopoverContent`
    - `primitives/css/ui-kit.PopoverTrigger`
    - `primitives/icon-picker.IconPicker`
  - Exports (values): `calloutBlock`
- Server:
  - Contributes: `page.block-data` "callout"
  - Uses: `page/editor.Editor`
- Core:
  - Uses:
    - `page/editor.defineBlock`
    - `page/editor.SvgNodeSchema`
  - Exports (types): `CalloutColor`
  - Exports (values):
    - `CALLOUT_COLORS`
    - `calloutBlock`
    - `calloutDataSchema`
- E2e:
  - Uses:
    - `framework/tooling/e2e-harness.arg`
    - `framework/tooling/e2e-harness.baseUrl`
    - `framework/tooling/e2e-harness.report`
    - `framework/tooling/e2e-harness.snap`
    - `framework/tooling/e2e-harness.withBrowser`
    - `page/editor.blockText`
    - `page/editor.caretState`
    - `page/editor.openBlankPage`

<!-- AUTOGENERATED:END -->
