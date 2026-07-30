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

## The container shape is not declared here

`core/callout-block.ts` calls **`defineContainerBlock`**
([`page/container`](../container/CLAUDE.md)), not `defineBlock`. That factory
forces the three facts that are only correct together — `anchor: true`,
`collapsible: "never"`, `wrapOnConvert: true` — and constrains its schema to a
shape without `text`, so a text-bearing callout is a compile error rather than a
runtime surprise. `acceptsText` is still *derived* from the schema
(`"text" in schema.shape`), so voidness is a fact of the payload and the write
boundary's strict parse rejects a stray `text` outright.

Read that plugin's doc for what each flag buys and why they cannot be declared
piecemeal. This file therefore declares nothing but the callout's identity and
its `{icon, iconSvgNodes, color}` appearance payload — and the two shells it
composes:

- **The frame** (`web/components/callout-frame.tsx`) paints the tint, over the
  anchor's row plus its whole visible subtree. A block renderer cannot do this
  itself: both surfaces render the forest as a flat list of sibling rows so a
  structural move only reorders keyed elements, which means a block's children are
  not its DOM children. `Editor.BlockFrame` is the seam for the other half — see
  `page/editor`'s `internal/block-frames.ts`. Contributing one is also what *makes*
  the callout a container: the framed-type set is derived from that slot's
  registered matches (`useFramedBlockTypes()`), so there is no second "I am a
  container" flag to drift from who actually paints a box.

  The frame declares the **tint and nothing else** — `ContainerBackdrop` owns the
  box's geometry (`absolute` insets from `inset`, never `h-full`, no horizontal
  offset of its own), which is why the tint bleeds to the content edge `C` rather
  than `C + BLOCK_INSET`, and why a stray padding or left border can no longer
  strand the enclosed rows' hover controls.

- **The anchor** (`web/components/callout-anchor.tsx`) is the icon, and it rides
  on the *same* `Editor.BlockFrame` registration (`BlockFrameMeta.anchor`) so a
  type cannot claim anchorhood without actually registering as a container.
  `./singularity check page-editor:anchor-has-decoration` pins the two halves
  together — a handle declaring `anchor: true` whose plugin supplies no component
  is an invisible container, not a cosmetic gap.

  It supplies a `glyph` and `sections` to `ContainerAnchor`; the shell owns the
  static-vs-interactive branch, the trigger and the popover, and the surface owns
  the geometry (a `BLOCK_INDENT`-wide column at `C`, seated on the first visible
  child's borrowed first-line centre, plus the drag listeners).

## The icon popover carries the whole block-actions menu

An anchor row renders **no hover rail**. Its three gutter slots would be
identical to its first child's, on the same visual line, and the child must keep
its own handle — so there is nowhere to hang a `BlockActionsMenu` off. Everything
an ordinary block gets from that handle therefore lives on the icon: the surface
gives it drag-to-move, and the popover carries colour, icon, Reset, plus the two
structural actions.

The split between them is exactly the primitive's: **Remove callout** and
**Delete** are the shared structural actions and come from `ContainerAnchor`
(they are different intents — remove dissolves the box and promotes the children
via the `unwrap` op, delete takes the subtree with it — which is why they stay
two rows). Colour, icon and Reset are the callout's own, and live in
`web/components/callout-appearance.tsx` as the `sections` it hands the shell,
because they exist only by virtue of its payload. The shell owns the popover's
open state, so those sections dismiss it through the `close()` they are given
rather than holding a second copy of it; the swatches deliberately do not close
(picking colours in a row is a comparison, not a commit).

The trigger `preventDefault`s its mousedown (the click lands beside a live
caret), and commits fire on `onMouseDown` — the same shape `BlockActionsMenu`
uses, for the same reason. `width="xl"` on the shell is the callout's own: its
sections host the full icon picker.

## What is deliberately NOT here

There is no callout-specific keystroke handling, and that is the point. Enter in
a child is an ordinary sibling split; Tab / Shift+Tab nest and un-nest with no
callout logic; arrow navigation skips the anchor because it registers no focus
handle; converting a child's type can never reach the container. The single
callout-shaped rung in the generic ladder is `unwrap` — Backspace at the start of
an anchor's first child — and it exists because the generic `isIndented` → outdent
rung would pop that child out *and adopt the remaining siblings as its children*,
silently re-nesting content nobody asked to nest.

The `Editor.Block` contribution is kept with the primitive's shared **null
renderer** (`ContainerNoRow`). `BlockRow`'s anchored branch never dispatches that
slot for an `anchor` type, so it is unreachable — but the registration is where
the HANDLE lives, and the handle is what the insert palette, markdown, paste, the
turn-into list and the reducer's `anchorTypes` all read.

The two e2e scripts are this plugin's real spec, and they are the regression
proof for any change to the container primitive:
`e2e/callout-container-verify.ts` (zero-height row with visible children, a
visible one-line box when childless, the icon's clickable box inside the
`[C, C+BLOCK_INDENT]` column, its centre within ~2px of the first child's
first-line centre, Enter yielding a sibling inside the tint, `/h1` on a child
leaving the container untouched, Tab in/out preserving the caret, Backspace at
the first child's start unwrapping) and `e2e/callout-wrap-verify.ts` (`/callout`
keeps the origin's id and caret; the wrap is ONE undo entry).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Callout block type: a void CONTAINER whose tinted box wraps blocks of any type nested inside it, with a changeable leading icon and semantic color, for notes/tips/warnings. Callout block type: registers its `data` schema (icon + semantic color) at the server write boundary.
- Web:
  - Contributes:
    - `Editor.Block` "callout" → `ContainerNoRow`
    - `Editor.BlockFrame` "callout" → `CalloutFrame`
  - Uses:
    - `page/container.ContainerAnchor`
    - `page/container.ContainerBackdrop`
    - `page/container.ContainerNoRow`
    - `page/editor.BlockAnchorProps`
    - `page/editor.Editor`
    - `page/editor.PageIcon`
    - `primitives/css/row.Row`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.SectionLabel`
    - `primitives/css/ui-kit.cn`
    - `primitives/icon-picker.IconPicker`
  - Exports (values): `calloutBlock`
- Server:
  - Contributes: `page.block-data` "callout"
  - Uses: `page/editor.Editor`
- Core:
  - Uses:
    - `page/container.defineContainerBlock`
    - `page/editor.SvgNodeSchema`
  - Exports (types): `CalloutColor`
  - Exports (values):
    - `CALLOUT_COLORS`
    - `calloutBlock`
    - `calloutDataSchema`

<!-- AUTOGENERATED:END -->
