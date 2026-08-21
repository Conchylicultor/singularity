# container

The **void container** shape, in one place. A void container is a block type that
owns no text at all: its row paints a single leading decoration and its displayed
content IS its children, which are ordinary blocks of any type that do not know
they are inside it.

```
Container          ← the anchor: appearance only, no line of its own
├── Heading
├── Text
└── Bulleted list
```

Three kinds exist today — `page/callout` (a solid tint, prose the reader should
notice), the four dashed [`page/annotations`](../annotations/CLAUDE.md) cards
(meta, addressed to or withheld from an agent), and `page/quote` (a bare left
rule, a quoted passage) — and this plugin is everything they have in common. It contributes **nothing** itself: it is a library the
container plugins build their own block type out of.

## Why a primitive, and not "copy the callout"

`/context` shipped once as a text-bearing collapsible card and had to be
withdrawn. Both of its symptoms were the same mistake — one row playing container
identity, appearance AND the first line of content at once:

- its first line could never be a heading, because the title row was `text`-typed
  by construction;
- Enter in the title minted a second sibling card whenever
  `splitChildWhenExpanded`'s policy did not apply (caret at offset 0, or a
  collapsed card).

The callout had already solved this, but its solution lived in separate
`defineBlock` flags a second container had to know to copy. So the flags are no
longer copyable: `defineContainerBlock` **forces** them, and the shape is one
import rather than one convention.

A container IS collapsible — it folds to its borrowed line, so it needs no row of
its own to hang a chevron on. See *A container folds to its borrowed line* in
[`page/editor`](../editor/CLAUDE.md). The fold's **fallback**, for the cases the
borrowed line's single chevron slot cannot serve (nested containers share one
line; a first child whose own chevron is load-bearing keeps it), is a Collapse
item in that line's rail popover — not this plugin's code at all. See *The glyph
is appearance; the rail is structure* below.

## `defineContainerBlock` — the two facts are forced, because they are one fact

`core/define-container-block.ts` wraps `defineBlock` and supplies:

- **`anchor: true`** — the type renders no line. The surface collapses its row to
  zero height while it has visible children and paints its decoration in the
  `BLOCK_INDENT` column at the container's content edge `C`; the pure reducer
  reads the same fact (`BlockOpContext.anchorTypes`) for its split/merge refusals
  and the childless-anchor prune. Because the container owns no line, converting
  its first child to a heading cannot touch it, and Enter in a child is a plain
  sibling split.
- **`wrapOnConvert: true`** — `/<container>` on an existing block WRAPS it: the
  origin keeps its id, type, `data` and children and becomes the anchor's first
  child, both rows minted in ONE patch (one undo entry). A void type has nowhere
  to put a retyped block's text, so a swap would silently drop it; keeping the
  origin's id is what keeps the caret still (its content `Y.Doc`, its
  `Y.UndoManager` and its registered focus handle are all keyed by block id); and
  it is what lets the container's first visible line be a heading, a to-do, an
  image or a code block.

They are forced together because each is load-bearing for the others — declaring
them piecemeal is exactly what produced the withdrawn `/context`.

### A text-bearing container is a compile error

`acceptsText` is *derived* from the schema (`"text" in schema.shape`), so
voidness is a fact of the payload rather than a flag that could disagree with it.
The factory restates that fact in the type system: its options are intersected
with `RejectTextBearing<S>`, which is `unknown` for a void schema and an
unsatisfiable object for one whose shape declares `text`. So `textBlockSchema({})`
— and a hand-rolled `z.object({ text })`, which carries no `TextBearingSchema`
brand and would slip past a brand-only check — both fail at the call site with
"Property `__void_container_schema_must_not_declare_text` is missing". Keying on
the *shape* rather than the brand is deliberate: the shape is what the runtime
derivation reads, so the two answers cannot drift.

It is a conditional intersection member rather than a constraint on `S` because
constraining `S` to `AnyZodObject & { shape: { text?: never } }` rejects
**every** schema: zod derives `keyof()._cache` from the shape, so narrowing the
shape to `{ text?: never }` makes `Set<"color" | …>` un-assignable to
`Set<never>`. (Measured, not assumed — that constraint was the first attempt.)

A runtime throw at module eval backs it up for a caller arriving through `any`
(a JS caller, a dynamically built schema): loud at boot beats a silently
text-bearing container. The type-level guard also fails CLOSED on `any` —
`keyof any` includes `"text"`.

The return type carries that fact past the boundary: `BlockHandle<z.infer<S>> &
{ text?: undefined }`, not the bare handle `defineBlock` gives back. Downstream
needs the proof — `Editor.Block`'s registration union admits a block naming its
own `component` only on the text-less arm — so without it every container, void
by construction, fails to register. Don't weaken it back to `BlockHandle<…>`.

The declaration surface is also much smaller than `defineBlock`'s, and that is
the other half of "inconsistent is unrepresentable": everything an anchor cannot
coherently declare is simply absent — `placeholder`, `marker`, `textVariant`,
`splitInto` / `splitChildWhenExpanded` / `dataOnSplit`,
`resetToOnBackspaceAtStart` / `breakOutOnEmptyEnter`, `toggle`,
and `gutterFirstLineCenter` (the surface seats the decoration on the first
child's borrowed first line).

`typingPrefixes` **is** accepted (and `markdownPrefixes` is not): a container's
markdown syntax is its `<tag>`, so its prefix can only ever be a typing trigger.
`MarkdownShortcutPlugin` reads it and calls `convertTo`, which for a
`wrapOnConvert` type wraps — the line being typed becomes the container's first
child, prefix stripped. `page/annotations/todo`'s `TODO ` and `page/quote`'s `| `
are the two users today.

## Three web shells, one per structural half of a container

- **`ContainerNoRow`** — the `Editor.Block` renderer, which paints nothing.
  `BlockRow`'s anchored branch never dispatches that slot for an `anchor` type,
  so it is unreachable; the registration is NOT vestigial, because it is where
  the **handle** lives, and the handle is what the insert palette, the markdown
  pipeline, paste, the turn-into list and `useAnchorTypes()` all read. Shared
  rather than stubbed per container, for the same reason `BlockTextRenderer` is
  shared verbatim by every text type: two containers then resolve to the same
  renderer and reconcile in place.

- **`ContainerBackdrop`** — the frame's positioned box. The primitive owns the
  GEOMETRY and the consumer passes appearance classes only, which is what makes
  the three documented frame rules (`BlockFrameProps`) true by construction:
  `absolute` insets filling the surface-provided box from `inset` (the editor's
  already-resolved content edge `C`, 0 on surfaces with no rail), never `h-full`
  (an explicit height defeats the editor's grid stretch), and no horizontal
  offset beyond `inset` (the rows inside seat their hover controls against that
  same edge, so shifting the flow would strand them). The single
  `layout/no-adhoc-layout` escape for the whole family lives here.

  The appearance channel is deliberately named `className`: the
  `no-adhoc-layout` / `no-adhoc-spacing` / `no-adhoc-radius` /
  `no-adhoc-surface` rules all scan a `className` attribute, so "appearance
  only" is enforced at the consumer's own call site rather than trusted.

- **`ContainerAnchor`** — the decoration shell, and **appearance only**. It owns
  the static-vs-interactive branch on `editor` presence, the trigger
  (`preventDefault`ed mousedown, because the click lands beside a live caret) and
  the popover. The consumer supplies the `glyph` and optionally `sections` — its
  own appearance controls, handed `{ editor, close }` — with `triggerLabel` and
  the width typed as travelling WITH `sections`, so "a glyph with no appearance but
  a trigger label" is unrepresentable.

  The width is one of TWO mutually exclusive props, and which one a consumer
  passes says what its sections ARE. `panel: ControlPanelSize` means they are
  built from the control-panel vocabulary (`ControlPanel.Section` / `.Row` / …),
  which the shell then opens with a `ControlPanelPopover`: those members need a
  `cp-panel` ancestor to inherit their inset from and hang their hairlines off,
  and the body already owns its padding, so a `PopoverContent padding="sm"`
  around it would be a second inset. `width: PopoverWidth` is the other case —
  arbitrary content in an ordinary padded popover (the TODO card's launch form,
  the agent-notes authorship list). Neither is a default for the other: a panel
  has no measurement to pick, and a launch form has no band to separate.

  With no `sections` there is nothing to open, so the shell renders a plain
  non-interactive glyph on **both** surfaces (the context card's state). With
  sections, the branch on `editor` is still load-bearing beyond styling:
  `sections` is handed a definitely-present `BlockEditorAPI` and writes through
  it, so a read-only surface (blog renderer, version-history preview) has nothing
  honest to render but the mark.

  The surface owns the anchor's geometry — a `BLOCK_INDENT`-wide column at `C`,
  seated on the first visible child's borrowed first-line centre, and the drag
  listeners — so the shell must not position or size itself, nor establish flow
  height.

## The glyph is appearance; the rail is structure

Collapse / **Remove `<name>`** / Delete used to live in the glyph's popover, for
one stated reason: an anchor row renders no hover rail, so there was nowhere to
hang a block-actions menu. **There is now.** The rail on the line the container
BORROWS resolves the container as its owner (`RailSeat`, `page/editor`'s
`internal/rail-seat.ts`), so its `⠿` handle opens a menu whose container arm
carries exactly those actions — and this plugin contributes none of them:

- the arm is selected by the core fact `BlockHandle.anchor`, so a container with
  no appearance (context) still gets it;
- `Remove <name>` derives its wording from the handle's own `label`, which is why
  `ContainerAnchorProps.name` is gone rather than threaded through;
- **Remove and Delete stay two rows** — different intents. Remove dissolves the
  box and promotes the children into its slot (the `unwrap` op, the escape hatch
  that keeps the content, and what Backspace at the start of the first child
  resolves to); Delete takes the subtree with it.

Appearance is reachable from **both** the glyph and the rail — the consumer
registers the same component as `sections` and as `BlockFrameMeta.menu`. That is
the user's spec, not an oversight: the rail is where one looks for a block's
actions, the glyph is where one looks for the glyph.

## Selecting a container: cover its lines

Same shape as the rail: an anchor renders no line, so there is nothing for a
pointer to click. A drag, a Shift+click and a click-and-extend all reach the
lines INSIDE the box and never the box itself, and the editor's `rowAtPointer`
skips the zero-height row by an explicit height guard. So the selection rule
states the only thing a pointer can mean:

> A selection covering every line a container owns IS a selection of the
> container.

`page/editor`'s `withContainersSelected` closes over it and `blockSelectionRoots`
is the one resolver every bulk gesture goes through, so copy, cut, duplicate and
drag all carry the box. Coverage is measured against the visible lines, so a
COLLAPSED container is selected by its one borrowed line. See *Selecting every
line a container owns IS selecting the container* in
[`page/editor`](../editor/CLAUDE.md) — a container plugin writes nothing for it.

## What stays with each container

Everything with a per-instance payload behind it: the callout's colour swatches,
icon picker and Reset (driven by its `{icon, iconSvgNodes, color}` data), and the
context card's fixed glyph and dashed look. A container with no appearance
contributes no `sections` and no `menu` — it does not inherit a picker it has no
field to write to, and it loses nothing structural by it.

The `Editor.Block` / `Editor.BlockFrame` **registrations** also stay with each
container, deliberately. Containerhood is derived from who actually paints a box
(`useFramedBlockTypes()`), and the anchor rides on that same registration
(`page-editor:anchor-has-decoration` pins the pair) — a primitive that registered
on a consumer's behalf would put those facts one indirection away from the plugin
they describe.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Void-container primitive for the page editor: the shared null row renderer, the frame backdrop that owns a container decoration's geometry, and the anchor-decoration shell (static/interactive branch + the optional appearance popover — the structural actions live on the rail of the line the container borrows). Contributes nothing itself — each container plugin registers its own block type through it.
- Web:
  - Uses:
    - `primitives/css/center.Center`
    - `primitives/css/control-panel.ControlPanelPopover`
    - `primitives/css/control-panel.ControlPanelSize`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.Popover`
    - `primitives/css/ui-kit.PopoverContent`
    - `primitives/css/ui-kit.PopoverTrigger`
    - `primitives/css/ui-kit.PopoverWidth`
  - Exports (types): `ContainerAnchorProps`
  - Exports (values):
    - `ContainerAnchor`
    - `ContainerBackdrop`
    - `ContainerNoRow`
- Core:
  - Uses:
    - `page/editor.BlockHandle`
    - `page/editor.BlockMarkdown`
    - `page/editor.defineBlock`
  - Exports (types):
    - `ContainerBlockOptions`
    - `RejectTextBearing`
  - Exports (values): `defineContainerBlock`
- Cross-plugin:
  - Imported by:
    - `page/annotations`
    - `page/annotations/agent-notes`
    - `page/annotations/context`
    - `page/annotations/private-notes`
    - `page/annotations/todo`
    - `page/callout`
    - `page/quote`

<!-- AUTOGENERATED:END -->
