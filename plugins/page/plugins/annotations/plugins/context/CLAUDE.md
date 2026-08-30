# context

A context card is a **void container** for standing instructions aimed at
*agents* rather than at the human reading the page — coding conventions, "always
run X first", a domain glossary. It owns no text and no appearance: its payload is
`{}`, and its content IS its children, which are ordinary blocks of any type that
do not know they are inside it:

```
Context            ← the anchor: its name in the corner, no line of its own
├── Heading  "Repo conventions"
├── Bulleted list  "run ./singularity build after every change"
└── Code block
```

Inserted with `/context` only.

## It shipped once as a text-bearing card, and that was wrong

The first version was a collapsible card whose header row was an editable title.
Two symptoms, one cause — one row playing container identity, appearance AND the
first line of content at once:

- its first line could never be a heading, because the title row was `text`-typed
  by construction;
- Enter in the title minted a second sibling card whenever
  `splitChildWhenExpanded`'s policy did not apply (caret at offset 0, or a
  collapsed card): `keystroke-intent.ts` resolves
  `tailType = asChild ? childType : (siblingType ?? node.type)`.

The callout had already solved this by owning no text at all, and that is now the
shared shape: `core/context-block.ts` calls **`defineContainerBlock`**
([`page/container`](../../../container/CLAUDE.md)), which forces `anchor: true`
and `wrapOnConvert: true` and rejects a text-bearing schema at the type level.
Neither symptom is expressible any more: the container has no
line to type into, and `/context` on an existing block **wraps** it — which is
also what lets the first visible line be a heading.

**It folds, and needed no header row to do it.** A context card holds standing
instructions a reader usually wants out of the way, so this is the point of the
block. It collapses to its BORROWED line — its first child's, the same line the
anchor already borrows for its own seat — so nothing moves, and the chevron
lives on that line's row rather than on a title row the void model exists to
avoid. See *A container folds to its borrowed line* in
[`page/editor`](../../../editor/CLAUDE.md).

## The void payload is enforced, not aspirational

`contextDataSchema` is `z.object({})` — `divider` is the precedent for an empty
payload. The write boundary parses through `handle.schema.strict()`, so a stray
`text` key is a 400 rather than a quietly-stored field; that is what makes the
previous model's rows unwritable rather than merely unused. `core/context-block.test.ts`
pins both the rejection and the forced container facts.

There is no per-instance appearance either, and the decoration reflects that: the
card's **name** in the box's top-right corner, revealed only while the pointer is
inside it, with **no popover at all** — a plain answer on both surfaces. It used
to be a fixed `MdRule` glyph in the margin; the icon still names the card in the
slash menu, off the handle, it just stopped charging every card on the page for
a fact the tint already carries. It contributes neither `sections` nor `BlockFrameMeta.menu` rather than
inheriting a picker it has no field to write to, and loses nothing by it: the
structural actions (Collapse / Remove context / Delete) come from the rail on the
line it borrows, generically over `BlockHandle.anchor`.

## The frame is appearance only

`web/components/context-frame.tsx` paints the soft wash over the card's own
(zero-height) anchor row plus its whole visible subtree. A block renderer cannot
do this itself: both surfaces render the forest as a flat list of sibling rows, so
a block's children are not its DOM children — `Editor.BlockFrame` is the seam for
the other half.

Contributing that frame is also what *makes* this a container: the framed-type set
is derived from the slot's own registered matches (`useFramedBlockTypes()`), so
there is no second "I am a container" flag to drift from who actually paints a
box. The anchor rides on the same registration, so `anchor: true` can never claim
a decoration nothing supplies (`./singularity check page-editor:anchor-has-decoration`).

The box's geometry belongs to `ContainerBackdrop`; this file declares only the
look. A soft tint and NOTHING else — no border, no icon. What separates it from a
callout is no longer a dashed edge but that a callout is DRAWN (an icon its
author chose) while an annotation is NAMED, and only when pointed at. See *The
family is NAMED, where a callout is DRAWN* in
[`page/annotations`](../../CLAUDE.md).

## Markdown emits the marker alone

A void container has no text, so `markdown.serialize` cannot read one — the
previous serializer's `data.text` no longer exists. It emits the marker **and
nothing else**:

```
**[Agent context]**
  - run ./singularity build after every change
```

Children serialize generically, indented two spaces under it by the central walk,
and carry all the content.

That is deliberately *not* the callout's blank line. The callout is decoration, so
losing it in an external projection loses nothing; the whole point of a context
card is that an agent reading a page's markdown can tell these lines are addressed
to it. Keeping the marker also keeps the children's indentation anchored to
something rather than dangling under a blank line. There is no `parseLine`:
internal copy/paste is lossless through the `BLOCKS_MIME` JSON forest, so
`text/plain` is purely the external projection, and claiming a parse prefix would
convert real prose on paste.

Nothing feeds page content to an agent today — a `/prompt` launch sends only that
block's own text. Delivering these cards to a launched agent is a separate,
deliberately deferred step (Stage 2 of
[`research/2026-07-29-page-context-block.md`](../../../../../../research/2026-07-29-page-context-block.md)),
and when it lands it reuses this serializer rather than adding a second rendering
path.

## What is deliberately NOT here

No context-specific keystroke handling, and that is the point. Enter in a child is
an ordinary sibling split; Tab / Shift+Tab nest and un-nest generically; arrow
navigation skips the anchor because it registers no focus handle; converting a
child's type can never reach the container. The one container-shaped rung in the
generic ladder is `unwrap` — Backspace at the start of the first child — and it is
the editor's, not this plugin's.

Also absent: `typingPrefixes` (`/context` is the only entry point; every short
prefix worth claiming is taken, and one that matched real prose would convert
paragraphs nobody asked to convert) and any `Editor.Block` renderer of its own —
an anchor renders no row, so it registers the primitive's shared `ContainerNoRow`.
The registration still matters: it is where the handle lives, and the handle is
what the insert palette, markdown, paste, the turn-into list and the reducer's
`anchorTypes` all read.

One consequence of the anchor model worth knowing: `pruneEmptyAnchors` is a
forest-wide post-pass on every reducer op, so a **childless** context card
dissolves on the next structural keystroke anywhere on the page. Cards are never
born childless (the wrap mints the anchor and its first child in one patch), and
the surface renders a childless one as a real one-line box in the meantime rather
than an invisible ghost.
<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Context block type: a void CONTAINER whose soft-tinted box wraps blocks of any type nested inside it, holding standing instructions addressed to agents rather than to the reader. Context block type: registers its (empty) `data` schema at the server write boundary, rejecting stray keys like an injected `text`.
- Web:
  - Contributes:
    - `Editor.Block` "context" → `ContainerNoRow`
    - `Editor.BlockFrame` "context" → `ContextFrame`
  - Uses:
    - `page/container.ContainerBackdrop`
    - `page/container.ContainerCornerLabel`
    - `page/container.ContainerNoRow`
    - `page/editor.Editor`
  - Exports (values): `contextBlock`
- Server:
  - Contributes: `page.block-data` "context"
  - Uses: `page/editor.Editor`
- Core:
  - Uses: `page/annotations.defineAnnotationBlock`
  - Exports (values):
    - `contextBlock`
    - `contextDataSchema`

<!-- AUTOGENERATED:END -->
