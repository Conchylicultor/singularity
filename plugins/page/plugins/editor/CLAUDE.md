# editor

## The sidebar's ordering space is `docRank`, not `rank`

`page_blocks.rank` is a fractional index, comparable **only within one
`(parent_id, rank)` space**. The Pages sidebar's sibling group is *pages sharing
a `pageId`*, which spans several such spaces — so two of its rows legitimately
hold the same rank, and `Rank.between("a1", "a1")` throws inside `computeDrop`.

So the **server** defines the order. `pagesLiveResource` emits a `PageRow` =
`Block` + **`docRank`**: a real minted `Rank`, unique and ordered within one
`pageId` group, derived from true document order by `docOrderPaths()` (an upward
rank-path CTE, sorted in JS). Rows come back in that order, so **display order,
array order, and `computeFlatReorder`'s rank-sorted neighbourhood are one order**.
See
[`research/2026-07-16-page-sidebar-document-order.md`](../../../../research/2026-07-16-page-sidebar-document-order.md).

- **Never write `docRank` back** — no column, no migration, never in a request
  body. It is valid only against the group it was minted with, and the same row
  read through `blocksResource` carries none, so persisting it would give one row
  two conflicting ranks. `rank` stays the storage key; moves send **positional
  intent** (an anchor id) and the server mints the rank against the full sibling set.
- **Membership is never a function of the traversal.** The loader's driving
  relation is the plain drizzle select; the path map is looked *onto* it. A page
  whose path can't resolve keeps its row (sorted last in its group, by raw `rank`)
  — dropping it would remove the page from the `[[` picker, breadcrumbs, the story
  gallery and the blog panel, not merely mis-order the sidebar. (Only corruption
  reaches that branch — a live page can never point at a trashed parent.)
- **Don't move the sort into SQL.** `rank_text` is `TEXT COLLATE "C"`, but a
  recursive CTE can flatten the domain back to plain `text` and revert to locale
  collation, where `'a' < 'B'` while `Rank.compare` says `'B' < 'a'`.

`docRank` derives from **ranks, not content**, so the ~1s `data.text` projection
re-runs this loader on every keystroke burst for a byte-identical result — empty
diff, no push.

## The page column (one owner for the content-left edge)

`web/internal/page-column.ts` is the **single declaration site** for the column's
horizontal geometry. The invariant:

> A page's block content box has a left edge `C`.
>
> - Block **decorations** start at `C` (quote border, callout tint, code
>   background, image, divider rule, selection highlight, diff rail).
> - Block **content** (text, media) insets from `C` by `BLOCK_INSET`.
> - Anything a host renders *alongside* blocks that is not itself a block — page
>   title, page icon, section list — sits at `C + BLOCK_INSET`.

The editable surface reserves the hover rail (`BLOCK_GUTTER`, 64px) to the **left**
of `C`, inside each row's own padding so the `+` / drag / chevron controls are
hoverable. Editable-surface-only: `read-only-view` has no rail, so its `C` is the
renderer's left edge. `BLOCK_INSET` is shared by both.

A row seats those controls against the content edge of its **outermost enclosing
container frame** — which for an unframed row is its own. A container that owns no
text (the callout anchor) paints its decoration in the `BLOCK_INDENT` column at its
own `C`, which is exactly where its first child's chevron would sit under the naive
rule; the child's row is later in DOM order at the same `z-raised` level, so the
decoration would be not merely overlapped but **unclickable**. Seating the enclosed
rows' rail at the frame's edge puts the controls *outside* the box and leaves that
column free. `BlockRow` takes the resolved `railLeft` as a prop and still computes
no geometry itself — `block-editor.tsx` derives it from the `frameSpans` it already
has.

**Hosts never compute the edge.** `BLOCK_GUTTER` is deliberately *not* exported from
the web barrel — a host that re-adds it to its own wrapper's padding drifts the title
off the block text's edge. Instead: editable page surface → `<PageContentColumn>`
(rail + inset); read-only surfaces → `<Inset x={BLOCK_INSET}>` with
`<ReadOnlyBlocks>` flush at `C`; a new block type → `<Inset x={BLOCK_INSET} y="…">`
(vertical padding is *not* part of `BLOCK_INSET` — it differs per block).

Never splice a ramp step into a class name (`` `pl-${BLOCK_INSET}` ``): Tailwind emits
an `@utility` only for literal tokens it can scan. Use `<Inset>`, or `insetClass()`
from the spacing primitive when you only have a `className`.

Two known deviations from the invariant: the code background sits at
`C + BLOCK_INSET` rather than bleeding to `C` (its `px` wrapper is outside the
decoration), and the quote's 2px border pushes its text to `C + 2 + BLOCK_INSET`.
(The callout tint was a third until it became a container frame — the frame gets
`C` handed to it as `inset`, so it now bleeds correctly.)

`blockContentLeft(depth)` is the one derivation of `C` in the editable surface's
row coordinates. A container frame insets its decoration to it, and the editor
evaluates it — at a row's own depth, or at its outermost enclosing frame's — to
hand each `BlockRow` its `railLeft`; nobody re-derives `BLOCK_GUTTER + depth *
BLOCK_INDENT` by hand.

## Container frames (the one exception to the flat list)

The forest renders as a **flat list of sibling rows**, and `flattenTree`'s comment
says why: every block stays in the same React parent, so indent/outdent/move only
reorder keyed elements and a block's Lexical instance (and its focus) survives.
The direct consequence is that a block renderer can only ever paint its OWN row —
a block's children are not its DOM children, so it cannot draw a box around them.

`Editor.BlockFrame` is the seam for the other half. A block type that contributes
one becomes a **container**: `internal/block-frames.ts` groups its visible
subtree — always a contiguous run in a depth-first flatten — and hands it to the
contribution as `children`, which paints the box around the lot. A collapsed
container still gets a frame around its own row (the box must not blink out when
you collapse it), and containers nest.

Three rules keep the exception from eating the rule it excepts:

- **Only contributing types are grouped.** The framed-type set is derived from
  the slot's own registered matches (`useFramedBlockTypes`), not from a separate
  flag that could drift from it, and `groupFrames` short-circuits to the
  byte-identical flat mapping when the set is empty. Every non-container block
  keeps the flat guarantee exactly as before.
- **A frame is appearance only, and horizontal geometry is not its to touch.**
  Vertical padding is fine (it shifts rows down, harmlessly). Left padding or a
  left border in the *flow* is not: rows seat their gutter controls against a
  content edge the SURFACE computed (this frame's, for the rows inside it), so
  shifting the flow would strand them. Decorations inset to the `inset` prop
  instead.
- **Geometry keeps reading the DOM.** Drag/drop, drop zones and the marquee all
  measure live rects via `[data-block-id]` + `getBoundingClientRect()`, never
  React tree position, so an extra wrapper perturbs none of them.

The cost this buys back: moving a block INTO or OUT OF a frame changes its DOM
parent, which remounts its Lexical instance. It fires only on that transition
(never per keystroke), and the content `Y.Doc` is ref-counted with a deferred
destroy so text survives; `e2e/indent-caret-verify.ts` is the caret spec.

`read-only-view` renders the forest recursively, so it dispatches the same slot
with `inset: 0` (no hover rail there) — one contribution, both surfaces.

### A container that owns no text: the anchor row

A frame-contributing block can go one step further and own **no line of its own**:
`BlockHandle.anchor` says its content *is* its children. The callout is the one
today — a void `{icon, iconSvgNodes, color}` payload whose first line is an
ordinary `text` child, so converting that child to a heading cannot touch the
container, and Enter inside it is a plain sibling split rather than a second
callout.

Four rules, each closing a failure the naive version has:

- **Zero height only while it has visible children.** `computeFrameSpans`
  deliberately spans a childless container over its own row alone (the box must
  not blink out when you collapse it) — at zero height that paints a 0px frame
  over a 0px row, i.e. an invisible, unclickable, undeletable ghost. With no
  children the row falls back to one empty line instead.
- **`collapsible: "never"`**, and the flatten treats those types as expanded
  regardless of the stored flag. There is no chevron left to reopen a collapsed
  anchor, and "creation sets `expanded: true`" is not a guarantee — `applySplit`
  and `applyInsert` both mint `false`, and a patch replay writes it verbatim.
  Making the flag *inert* is.
- **The decoration lives in the row layer, never the frame.** Frames are emitted
  before the rows and are `pointer-events-none`, so an interactive control there
  is hit-tested under the following row. The anchor component rides on the
  `Editor.BlockFrame` contribution (`BlockFrameMeta.anchor`) precisely so it
  cannot drift from who actually paints a box, but the *surface* mounts it — in
  the `BLOCK_INDENT` column at `C`, seated on the first visible child's borrowed
  first-line centre, since an anchor has no line of its own to measure.
- **An anchor row renders no rail.** Its three slots would coincide with its first
  child's, on the same visual line, and the child must keep its own handle. The
  container is dragged and menued through its decoration instead.

`BlockHandle.anchor` is a **core** fact because the reducer needs it (`BlockOpContext.anchorTypes`
drives the split/merge refusals and the childless-anchor prune) and the server has
no slots; the *component* is a web contribution. `page-editor:anchor-has-decoration`
fails a handle that declares one without the other.

Escaping the box is `unwrap` (`core/block-ops.ts`): Backspace at the start of an
anchor's first child dissolves the container and promotes its children into its
slot. The generic `isIndented` → outdent rung would instead pop that child out
*and adopt the remaining siblings as its children*, silently re-nesting content
nobody asked to nest.

## The caret does not stop at the editor's edge (`CaretSurface`)

The title sits above the block list, outside the provider, yet the caret must flow
across that seam the way it flows between two blocks — ArrowUp / ArrowLeft /
Backspace at the top of the body land in the title, Enter / ArrowDown /
ArrowRight in the title land in the body (Notion's model).

The seam is one contract, `web/caret-surface.ts`:

```ts
interface CaretSurface {
  focus(): void;                                     // required
  focusBoundary?(edge: "start" | "end"): void;       // land at my very start/end
  focusAtColumn?(x: number, edge: "top" | "bottom"): void;  // preserve the pixel column
}
```

Implementing it is all that is needed to participate: blocks (`BlockFocusHandle`,
which widens it with `focusOffset`/`truncateAt`/`appendRunsAtEnd`), the block list
(`BlockEditorHandle`, the host-facing ref), and host chrome (the page title over an
`<input>`, handed to `<BlockEditor caretBefore>`; `caretAfter` exists symmetrically,
unused). A host passing neither just gets a caret that stops at the first/last block.

Three rules keep this from leaking:

- **`landCaret` is the one landing policy** (`internal/caret-landing.ts`): vertical
  crossings preserve the pixel column *when the surface can honor it*, horizontal
  crossings land on the boundary they were travelling toward, and a surface
  offering neither refinement just takes `focus()`. `navigate()` calls it with the
  same arguments for blocks and host chrome, never branching — so a one-line
  surface merely omits `focusAtColumn`, with no special case anywhere.
- **`focus()` restores, it does not place** (`focusRestoringSelection`): an editor
  already holding a caret keeps it exactly where it is, and only a selection-less
  one is landed at its content start. Otherwise every re-focus of the block the
  user is standing in — `Tab`/`Shift+Tab`, whose executors call `focusBlock` —
  becomes a caret-to-start keystroke. **A caller wanting a specific position says
  so** (`focusBoundary(edge)` / `focusOffset(n)`), which is why the
  empty-background click goes through `focusBlockBoundary` in all three branches
  rather than leaning on a side effect of `focus()`. Spec:
  `e2e/indent-caret-verify.ts`.
- **`resolveKeystroke` never learns about the boundary.** Backspace at the start of
  the first top-level block has no block to merge into, so it resolves to what
  ArrowLeft resolves to there — `{ type: "nav", dir: "left" }`. Whether a surface
  waits on the other side is the executor's business, which is why "Backspace goes
  back to the title" needed no new intent, op, or resolver branch.

## Visible-line invariants (Enter / Backspace / Delete)

Split, merge, and the keystroke ladders all restate one fact: the user's mental
model, and the caret's, is the **visible line sequence**, not sibling space
(`parentId`+`rank`).

> Split turns one visible line into two adjacent visible lines: the tail
> becomes the immediately-next visible line; no other line changes position or
> depth. Merge is its exact inverse.

### Split adoption

**Adoption rule** (`applySplit`'s non-`asChild` arm, `core/block-ops.ts`): when
the origin has *visible* children (`block.expanded && childrenOf(...).length > 0`),
the tail adopts all of them — reparented to the new id, ranks preserved
byte-for-byte — and is opened. Collapsed children are not visible lines, so they
stay with the head, which deliberately keeps its own `expanded: true` even with
zero children afterward (harmless — no chevron without children — pinned by test
as a decision, not an oversight).

Adoption is **derived inside the reducer from the current forest state**, never
carried on the op as a flag minted at intent time: ops apply against the CURRENT
forest (the overlay replays onto a refreshed base; the server applies against its
own load), so a frozen flag could contradict the forest by the time the op applies
(e.g. a racing collapse). Spec: `block-ops.test.ts`'s `split ∘ merge round-trip`
(~500 seeds), where equality is **structural** — merge mints fresh ranks on every
adoption, so comparing rank strings would fail even on a correct round-trip.

### Enter at the START of a non-empty block preserves the origin's identity

At offset 0 with text after the caret, split inserts an **empty sibling ABOVE** and
leaves the origin untouched (same id, text, children, content doc, `data`,
`expanded`), caret staying put — so the origin's **block id never changes** and
every block-id-keyed thing (content-doc registry, per-block `Y.UndoManager`, undo
focus routing) stays stable. Notion's model; pinned by `block-ops.test.ts`'s
`identity:` split cases and `e2e/enter-at-start-verify.ts`.

The discriminator is `op.position === 0 && afterRuns.length > 0` (vs **empty-block
Enter**, which still spawns an empty sibling BELOW and moves the caret down). Both
the pure reducer (`applySplit`) and the web executor (`makeBlockAPI().split`) branch
on the *same* condition; the executor branch is load-bearing, not cosmetic — it
skips the origin's live-doc `truncateAt(0)`, which would wipe the whole content doc.
See
[`research/2026-07-22-page-enter-at-start-identity-preservation.md`](../../../../research/2026-07-22-page-enter-at-start-identity-preservation.md).

### The keystroke ladders

`web/internal/keystroke-intent.ts` applies the same visible-line idea to
deletion and to escaping structure:

> **Backspace** deletes the nearest visible thing to the LEFT of the caret:
> marker glyph (convertTo) → **excess** indentation (outdent) → line break
> (merge) → any remaining indentation (outdent) → boundary (nav-left).
>
> **Delete** deletes the nearest visible thing to the RIGHT of the caret:
> the line break below (merge the next visible line up) → boundary (nav-right).
>
> **Empty-Enter** escapes one structural level per press: indentation first
> (outdent, keeping the type), then the type (convertTo), then ordinary split.

Backspace's and empty-Enter's ladders order `convertTo`/`outdent`
**oppositely, deliberately**: Backspace strips what's visually nearest the caret
(the marker sits right there), while empty-Enter escapes nesting outward (the
type is the outer layer). Every rung is pinned by `keystroke-intent.test.ts`
(`Backspace` / `Delete` / `Enter` describes); its `trajectories` describe is the
multi-step spec, re-resolving a fixture across repeated keystrokes.

**Only EXCESS indentation is nearer than the line break above** (Notion's model,
`hasExcessIndentation`) — indentation the block SHARES with the visible line below
it isn't standing between the caret and that break, so peeling it would misalign
the block from its surroundings and leave the break still there. Hence the two
middle rungs **swap order** on that predicate instead of being fixed: a block
level with the line below merges in one press; a block deeper than it peels only
the excess levels first. Nothing below at all = excess against the top level, i.e.
the original ladder, unchanged.

Stated on depth, computed structurally (`!hasExpandedChildren && !hasNextSibling`)
— identical predicates, since `nextVisibleLine` yields a child (deeper), else a
next sibling (same depth), else an ancestor's follower (shallower) or nothing.

- **This rung's outdent can never adopt followers**: excess implies no next
  sibling, so `outdentOne` re-parents nothing — never the silent re-nesting
  `unwrap` exists to avoid, which the first child of an *ordinary* (non-anchor)
  parent used to hit here.
- **Outdent stays as the FALLBACK rung below merge**, for when there is no break
  above after all (page boundary, or a text-less previous line). Without it,
  deferring outdent removes the only escape from nesting for such a block.

**A ladder is only as good as the caret context feeding it.** Every rung gates on
`caret.atStart` / `caret.atEnd`, so `readCaretContext` returns **null** for an
anchor it cannot resolve (keystroke passes through) rather than `offset: 0`
alongside `atStart: false`, which silently demotes *every* structural keystroke to
a passthrough. In particular a **root**-anchored selection is a legal
document-level position that `$linearCaretOffset` must resolve as one — Lexical
produces it whenever the selection first materializes while the root is childless
(the normal state of a freshly split block), and never re-anchors it.

**Delete's ladder is deliberately one rung, and that is not an omission.**
Backspace's ladder is long only because the *current* block's own marker and
indentation sit physically between the caret and the line break above it. To the
right of a caret at end-of-line nothing does — the next block's marker and indent
are *after* that break, so they are not nearer. "Completing" Delete's ladder would
make it take three presses to remove one line break, which no editor does.

**Delete needs no new reducer op — it is Backspace's merge from the opposite
originating block.** That identity holds only because
`prevVisibleLine(nextVisibleLine(X)) === X` for every X with a next line (the
`duality` property test over the fuzz forest is the executable spec), which is why
`prevVisibleLine` has an **upward branch**: a first child's previous visible line
is its parent, so it can return a parent, not only a leaf. `mergeNext` resolves its
source to `nextVisibleLine(this)` and merges up the SAME `mergeBlock` path
Backspace uses, so the caret sits at the join and does not move. The source is a
*different* block, so its live runs come from `BlockFocusHandle.readRuns`; the
~1s-lagged `runsOfNode` fallback is reserved for **text-less** blocks that register
no handle, where empty runs are the true answer rather than an absorbed miss.

### Merge's adoption slot follows the same visible-line rule

Adopted children occupy the visible position the merged block occupied: when the
target is the merged block's own PARENT (the upward `prevVisibleLine` case — the
block is therefore the first child) they land BEFORE the block's former next
siblings (`Rank.nBetween(null, nextSibling(source)?.rank ?? null, n)`); otherwise
(target is a prev sibling's deepest leaf, nothing of the target's follows) they
append after the target's existing children. Both `PAGE_BLOCK_TYPE` refusals hold,
including "the parent is the page row".

### The `dataOnSplit` seam

(Checked to-do → unchecked tail, generalized.) Declared on the block handle in
**method syntax** — the same bivariance trap `text` documents in `define-block.ts`
(a property-typed function is contravariant in `data` and breaks
`BlockHandle<unknown>` registry assignability). Resolved in the **resolver**, not
the reducer or executor, because only the resolver sees block handles; guarded to
`tailType === node.type` so a heading→text end-split never runs the heading's
transform against the text schema. The result rides as `op.tailData` because the
pure reducer cannot see handles at all; absent means inherit. Bad payloads are
still caught by the strict `parseBlockData` at the write boundary.

`opBlockIds`' split case stays `[blockId, newId]`, deliberately omitting
adopted children — the same documented under-approximation as merge's
rewritten target: less cascade-confirmation coverage, but never a wrong drop.

## Block-selection mode: the container handles only keys it originated

Block selection lives on `internal/use-block-selection.ts` (range state + the
container's focus/keyboard policy), driven by the `SelectionControl` deep children.
It takes its structural surface as an `actions` prop rather than reading
`useBlockEditor()`, so it depends on nothing but React and the multi-select reducer
— which is what makes it jsdom-mountable (`web/__tests__/block-selection.test.tsx`).

The load-bearing invariant:

> The selection container's `onKeyDown` acts **only** on keystrokes whose
> `e.target` is the container itself. Never `document.activeElement`.

The container is an ancestor of every block's `contenteditable` and React delegates
`onKeyDown` from the root, so a key a block already consumed still bubbles here.
`document.activeElement === containerRef.current` is a TOCTOU: `enterSelectionMode`
*moves focus to the container* mid-dispatch, and the synchronous discrete `focusin`
makes React flush + re-render before the still-bubbling keydown arrives — which then
claims the event and undoes what the block just did. `e.target` is fixed at dispatch
time and no handler can move it. Pinned by `block-selection.test.tsx` ("keys targeted
at a block editor never reach the container handler") plus
`e2e/block-selection-verify.ts` for the single-dispatch symptom jsdom cannot
reproduce. See
[`research/2026-07-10-page-escape-block-selection.md`](../../../../research/2026-07-10-page-escape-block-selection.md).

The **clipboard** handlers in `block-editor.tsx` deliberately keep the
`activeElement` check — "does the container own the clipboard right now?" is a
genuine `activeElement` question, and a `copy` event's target follows the DOM
selection, not focus.

The second invariant, and why `focusContainer()` is not just a `.focus()`:

> Entering block-selection mode **relinquishes the text caret**. The mode owns the
> keyboard; no caret may stay parked in the block the user just left.

Focusing the container does not move the DOM selection, and Lexical re-derives every
commit's pending selection *from the DOM selection*. A caret left in a blurred block
lets any **untagged** reconcile conclude "the caret didn't move, so my root should have
focus" and call `rootElement.focus()`, destroying the selection with no user input.
Tagging is not an option: `@lexical/yjs` issues an untagged follow-up commit
(`$ensureEditorNotEmpty`) outside its own `COLLABORATION_TAG` block and exposes no
update-options seam. So `releaseCaret` drops the DOM selection instead — with no
caret a reconcile has nothing to restore, robust to ANY async refocus rather than one
trigger. See
[`research/2026-07-17-page-block-selection-focus-steal.md`](../../../../research/2026-07-17-page-block-selection-focus-steal.md).

Consequence before touching the selection bar: with no caret, a `copy` provoked from a
bar BUTTON has neither a selection for `execCommand("copy")` to fire on, nor a path to
the container's `onCopy` (the bar renders *outside* the container, so the event targets
the button). `copySelectionViaButton` handles both explicitly. Cmd+C / Cmd+X are
unaffected — they originate inside the container.

## The gutter `+` and `/` are one unified menu

Both open the **same** caret-anchored block menu (`components/block-menu-plugin.tsx`,
mounted once per text block) — Notion's model. One `CaretTriggerMenu` surface, one
keyboard model, one filtered `BlockTypeList`; only the *producer* of the open-state
differs, and both are `CaretQuery` handles from the caret-trigger primitive:

- **`/` trigger** (`useCaretQuery`): typing `/` at a word boundary opens it; the
  text after the `/` filters it. On commit the `/query` is stripped in place and
  the block converts, keeping the text around the slash.
- **Gutter `+` draft** (`useForcedCaretQuery`): `useInsertBlockBelow` inserts an
  empty paragraph below, focuses it, and flags it via `requestBlockMenu(newId)`;
  that block force-opens the same menu with its OWN text before the caret as the
  inline filter (placeholder "Type to filter"). On commit the filter text — never
  content — is dropped and the block converts. Esc / outside-press keeps the block
  and clears the draft, so `+` then Esc is "new empty line below" rather than a
  click that did nothing.

`blockMenuDraftId` on the context is the single source of truth for the draft's
open-state, so the flag and the menu can never disagree. The draft is born as the
type declaring `defaultText` (`page/text`), resolved via `defaultTextHandle` — the
editor core never names a block type.

There is deliberately **no bottom "Add block" button** (Notion has none either).
Every way to create a block already runs through a real block with a caret — the
gutter `+`, `/`, Enter, and the Notion-style click on the empty background below
the last block (`onEmptyClick`). A "pick, THEN create" popover would need its own
`SearchInput`, having no block/caret to filter inline. The turn-into menu is not
one of those: it renders `BlockTypeList` inline in the block-actions popover, over
a block that already exists.

Commit is `insertAfter` + `convertTo`, i.e. two undo entries (undo once → back to
a paragraph, twice → gone). Deliberate: the paragraph genuinely existed.

## Indent / outdent is a set operation

`BlockOp`'s `indent` / `outdent` carry `blockIds: string[]`, not one id. Tab inside
a block's text editor is simply the one-element case; Tab in block-selection mode
passes the selection roots. One op kind, one reducer, one server handler — the
optimistic overlay, the undo record, and the notify path all follow for free.

The two folds run in **opposite directions**, and that is what makes a selection
move as one rigid body rather than collapsing into a nested chain:

- **`foldIndent` — top-to-bottom.** A successful indent removes the mover from its
  sibling list, so the next selected sibling's previous sibling is that same new
  parent and the run lands as consecutive children of the block above it. The guard
  is the other half: a block whose previous sibling is *itself a selected block that
  stayed put* refuses to move, so a leading block that cannot indent holds its whole
  run in place. Skipping cascades; a fully-refused op is an identity no-op.
- **`foldOutdent` — bottom-to-top.** `outdentOne` adopts the followers left below
  the block (Notion's outdent). Bottom-up, every selected follower has already left
  by the time an earlier block moves, so only UNSELECTED followers are adopted, by
  the last selected block. Top-down, the first block would swallow the rest of the
  selection as children.

Ranks are only comparable within a parent, so the folds sort their input with
`documentOrder` (a rank-ordered DFS), never the caller's array order or a global
rank sort.

`dispatchOp` drops any op whose reducer diff is empty, so a refused Tab never
reaches the undo stack, the overlay, or the network. `canIndent` / `canOutdent`
run the same fold to drive the selection bar's disabled state — the affordance can
never disagree with what the key does.

## Undo / redo (one unified stack)

The editor **does not own the stack**: `<UndoRedoProvider>`
(`@plugins/primitives/plugins/undo-redo/web`) is mounted once per surface tab by
`apps-core/tab-surface` and the editor is one participant recording into it,
alongside the Pages sidebar. One document-level stack covers BOTH text and
structure — no per-block Lexical history.

- **The editor's entries are mount-scoped.** `BlockEditorProvider` records through
  `useScopedUndoRedo()`, so its entries drop off the stack when the editor unmounts.
  Required, not cosmetic: its thunks close over the per-`pageId` optimistic store and
  the per-block `Y.UndoManager`s, which die with the doc — so replaying one after
  unmount is a no-op at best and a patch into another page's overlay at worst. Net
  effect: after navigating away, Cmd+Z does not reach back into the old page.
  Entries whose thunks are pure server calls (the sidebar's trash-restore) are
  unscoped and survive.
- **One stack, surface-level router (focus-independent).** There is deliberately no
  Lexical `HistoryPlugin` — a per-block parallel history is a layering error: the
  `page_blocks` row tree, not a Lexical document, is the source of truth. Cmd+Z /
  Cmd+Shift+Z / Cmd+Y are NOT routed per-block and NOT registered by the editor:
  `TabSurface` mounts one `useUndoRedoShortcuts()` per tab (`surfaceId`-gated,
  `enableInInputs`, on the window-level `ShortcutManager`), so the sidebar and the
  body cannot race for the same key id and the keys fire regardless of which DOM
  element holds the caret — focus-dependent routing is exactly how Cmd+Z reached
  neither handler once focus fell to `<body>` after a structural undo. Nothing in
  the container `onKeyDown` consumes those keys, so the native keydown bubbles out
  untouched and text/structure interleave chronologically.
- **Text edits are per-block `Y.UndoManager` items mirrored onto the stack.** Text
  history lives in each block's content doc; `recordTextEdit` mirrors each new
  manager item 1:1 as a shared-stack entry calling `um.undo()`/`um.redo()` (see the
  CRDT section). There is no `data.text` autosave path — rows receive text only
  through the debounced doc→`data.text` projection.
- **Command-pattern patches, not snapshots.** At the mutation chokepoints in
  `block-editor-context.tsx`: snapshot `before`, compute `after`, `diffBlocks`
  (pure, `core/block-diff.ts`), derive minimal forward/reverse `BlockPatch`es, and
  `record` thunks that re-apply them onto the CURRENT state — so undoing an old
  action never clobbers later unrelated edits. `recordPatchEntry` is the shared
  helper; `recordStructural` calls it with no `coalesceKey` (structural ops never
  coalesce).
- **One single-row chokepoint (`commitRow`).** It snapshots rows, applies the
  transform to just that row, diffs into a minimal patch pair, optionally records
  it, then dispatches forward through the optimistic pipeline. `projectText`,
  `BlockEditorAPI.update`, `convertTo`, and `setExpanded` are thin callers, so
  forward apply and undo/redo are symmetric by construction and a new block type's
  `editor.update(...)` is recorded automatically. (Multi-row structural ops go
  through `dispatchOp`/`move`/`bulkDelete` + `recordStructural`.)
- **Same optimistic instance.** The `patch` overlay variant flows through the SAME
  `useOptimisticResource` as forward ops, POSTing to
  `POST /api/pages/:pageId/blocks/patch` (`handle-patch-blocks.ts`, a blind
  row-level upsert+delete writer sharing the op handler's delete-lifecycle and
  notify path). Undo/redo thunks dispatch patches DIRECTLY, never through the
  recording wrapper, and the primitive's re-entrancy guard ignores `record` during
  replay. Bound editors never re-read `data.text` from a patch — content flows
  exclusively through the block's `Y.Doc`.
- **Two patch predicates, deliberately asymmetric** (both in
  `internal/optimistic-block-ops.ts`). `isPatchAbsorbed` is the APPLY-GUARD — "would
  writing this onto THIS base change anything" — and must be exact, `data` INCLUDED:
  a data-only edit (to-do `checked`, callout color) is a real edit, and a data-blind
  guard swallowed every one of them in memory mode. `isPatchReflected` is
  CONFIRMATION — "does server truth prove my write landed" — and must NOT compare
  `data`: `parseBlockData` normalizes it and `data.text` trails the doc by ~1s, so a
  snapshot that provably contains the write can still differ, and comparing would
  stick the op in the overlay. Same question, different subject; don't merge them.
- **A patch's delete cascade reads POST-upsert parentage.** `handlePatchBlocks`
  UPDATEs before it DELETEs, so a row the same patch re-parents out of the deleted
  subtree has already left; `applyPatch` must agree or the overlay drops rows the
  server keeps (redoing an `unwrap` lost every promoted child).

**What is recorded:** all `dispatchOp` ops (`paste` included — see below),
`convertTo`, non-text `data` edits (to-do `checked`, callout color, image src… —
via `commitRow` with `coalesceKey: blockId`), single-block `move` (client-known
rank), `bulkDelete`, and `bulkMove`, each with an exact purely-computed
after-state; text edits as mirrored `Y.UndoManager` items. The editor no longer
uses `updateBlock` at all (`handle-update-block.ts` stays for page-level
consumers: page title, sidebar expand, cover).
`web/__tests__/structural-undo.test.tsx` is the per-mutation guardrail, asserting a
QUADRUPLE per mutation: the forward call changed the rows, `canUndo` flipped, undo
restores exactly, redo reproduces. The first is not ceremony — without it a
mutation that silently does nothing passes vacuously, which is how the data-blind
apply-guard hid.

**Not recorded:** `setExpanded` (pure view state, `record: false` — Notion doesn't
undo collapse/expand; still optimistic, just off the stack) and `projectText` (Yjs
owns text history). `bulkDuplicate` is the one remaining gap, for the one reason
that still holds: it mints ids SERVER-side (`insertForest`), so there is no
client-computed after-state to invert.

`bulkMove` is recorded off a client PREDICTION, not an overlay (its forward write
is still the bespoke endpoint, like `bulkDelete`). Sound only because
`planBulkMove`/`applyBulkMove` (`core/block-ops.ts`) are the ONE rank/order algebra
the server writer, the memory store and that prediction all run; the planner
document-orders its roots for the same reason the folds sort — `selectionRoots`
preserves input-array order and the two writers hold their rows in different ones.
Known next step: promote `bulkMove` to a real `BlockOp` (`OpEffect.reparent` and
`buildOverlayOp`'s move arm already exist; missing are a reducer arm, the
`opBlockIds`/`resolveOpOwnerPage`/`translateOpForStore` arms, and `parkRanks` in
`handle-apply-block-op`). That collapses forward write, undo and redo onto one
endpoint and one optimistic instance, killing the two-fire-and-forget-POSTs
ordering race it shares with `move` and `bulkDelete` today.

## Paste is an op (`{ kind: "paste", forest, afterId, parentId }`)

Paste was once the ONE editor mutation outside the optimistic pipeline — a
bespoke `POST /blocks/paste` the user waited on. A 25-block paste took 561-789ms
to first pixel with a ~500ms main-thread freeze; it read as the app hanging.

The load-bearing idea, and the thing not to undo:

> **Identity is minted client-side and travels ON the node.** `withMintedIds`
> (`core/serialized-block.ts`) turns `SerializedBlock[]` into
> `IdentifiedBlock[]`, and `planForestInsert` consumes those ids rather than
> minting its own — the same agreement `split`/`insert` get from `newId`. With
> ids agreed, both sides run the same planner and produce the same rows; ranks
> still differ per side and the server's stay authoritative, as for every op.

Ids ride the node rather than a parallel `ids: string[]` **because a positional
array breaks silently**: reorder a traversal on one side and the two sides insert
*different blocks*, so the op can never confirm.

- **`insertForest` is the DUPLICATE path only** (mints via `withMintedIds` at its
  own boundary — `bulkDuplicate` has no client prediction to agree with). The
  `/blocks/paste` endpoint is deleted: one write path for a forest insert.
- **Anchorless paste inserts at the START of `parentId`**, where anchorless
  `insert` appends. Inherited from the old endpoint's contract; only reachable on
  an empty page, since real callers resolve an anchor via `pasteAnchorId`.
- **`OpEffect.create` carries `ids: string[]`** — ROOT ids only. The forest lands
  in ONE transaction, so a root's presence implies its descendants'; listing every
  node would grow the confirmation scans with the paste for no extra power.
  `opBlockIds` makes the same call.
- **A missing anchor refuses the whole paste** (as `applyInsert` does for a
  missing `afterId`) — guessing another parent would drop content somewhere the
  user never asked for.
- `insertScopePageId` is shared by `applyInsert`/`applyPaste` — one page-scope rule.

`e2e/paste-optimistic-verify.ts` is the executable spec and does NOT trust
latency: it stalls the op endpoint 4s and asserts the blocks render long before
the server could answer, one op POST fires, the push neither duplicates nor drops
them, and they survive a reload.

## Per-block CRDT text (unconditional)

Per-block CRDT text is THE text pipeline
(`research/2026-07-07-page-per-block-crdt-plan-b.md`, Stages 0–5 complete — the
`crdtText` flag and the legacy `ValueSyncPlugin` + `useEditableField` autosave path
are deleted). Every `BlockTextEditor` binds to a **per-block `Y.Doc`** through
`@lexical/react`'s `CollaborationPlugin` (`components/collab-text-plugin.tsx`,
`id = block.id`, `shouldBootstrap={false}`, `editorState: null`), so remote/echoed
changes apply as a Yjs **merge**, never a serialized-string rebuild. Per Plan B,
**structure stays relational forever**: `page_blocks` rows remain the authoritative
tree and the structural op/patch pipeline is unchanged. Existing pages need no
migration — a block with no content doc lazy-seeds from `data.text` on first mount.

The transport seam is `internal/use-collab-block-doc.ts` — the ONLY place the
editor knows how content docs sync, so a future delta-WS transport swaps in behind
it and nothing else changes. It ref-counts one `{ doc, provider }` per block id
(strict-mode double mounts and second readers share one doc; deferred destroy on
last release) and wires `internal/live-state-yjs-provider.ts`: **in** = the
`blockContentResource` keyed live subscription (`applyUpdate` with provider origin
— the echo guard), **out** = first-writer-wins `doc-init` seeding (live doc
hydrated ONLY from the server's authoritative response, closing the duplicate-seed
hazard) + debounced (~300 ms) `doc-update` posts of merged local updates.

### Projection + content-doc-aware split/merge

- **`doc → data.text` projection.** `useTextProjection` observes the block's `Y.Doc`
  (push-based, local + server-applied), debounces ~1 s, serializes the bound
  editor's runs (byte-identical to `xmlTextToRuns` on the doc — same walk, no
  headless replica), and writes changed runs through `projectText` (`commitRow`
  with `record: false`, since Yjs owns text history) into the shared optimistic
  patch pipeline. It never echoes into the editor (`data.text` is read once, as the
  doc-init seed); skip-if-unchanged bounds churn; it flushes on unmount, never from
  a never-synced editor. Rows trail the doc by ≤1 s, so search / backlinks /
  history stay fresh.
- **Split (Enter)** keeps the row pipeline verbatim and additionally truncates the
  ORIGIN block's live editor from the caret (`BlockFocusHandle.truncateAt` →
  `internal/collab-text-surgery.ts`), driven THROUGH LEXICAL so the collab binding
  syncs the deletion into the content doc with marks/tokens intact. The projection
  is existence-gated against the RENDER-FRESH optimistic rows (`liveRowsRef`), not
  `rowsRef`: a deleted block's unmount flush fires before the effect that refreshes
  `rowsRef`, so an ungated flush would resurrect the just-deleted row.
- **Merge (Backspace-at-start)** appends the merging block's LIVE runs onto the
  target's bound editor (`BlockFocusHandle.appendRunsAtEnd`), then the structural
  merge deletes the block (its `page_block_docs` row FK-cascades). If the target's
  editor is NOT mounted, a lossless doc-level fallback (`appendRunsToBlockDoc`) runs
  FIRST and the delete only fires after it lands — a failed append leaves both
  blocks intact.
- **The doc-update pipeline is what reports "Saved".** The provider derives a
  `saveState` (`idle | syncing | error` + `lastFlushedAt`) from its own queue and
  publishes it via `onSaveState`/`getSaveState` (a memoized frozen snapshot, so a
  `useSyncExternalStore` consumer can never loop); `CollabTextPlugin` — mounted
  exactly once per block — feeds it to `useReportSync({ label: "text" })` and the
  surface aggregates (`error > syncing > saved > idle`), so the cloud says "Saved"
  only once every dirty block's bytes are server-acked. `syncing` starts at the
  KEYSTROKE edge, not when the 300 ms debounce expires. **Offline is `syncing`,
  never `error`** — a network-level rejection re-queues and retries push-based, so
  nothing is at risk; only a durable HTTP rejection (non-409 on `doc-update`,
  non-404 on `doc-init`) is an `error`, and it still throws loudly. `blockGone` is
  `idle` (bytes deliberately dropped; their content moved with the merge). The
  `data.text` projection is deliberately NOT reported: it is derived
  denormalization dispatched through the optimistic pipeline, which reports itself.
- **A `doc-update` 409 after sync means the doc row vanished** — usually
  FK-cascade-deleted (merge/delete) mid-flush. The provider never guesses: it
  re-arms its init path and lets a doc-init probe arbitrate. 404 (block genuinely
  deleted) is a quiet terminal stop; success (block ALIVE, row unexpectedly gone)
  re-creates the row from the FULL local doc state — never the `data.text` seed,
  which would duplicate content the doc already holds — and resumes the flush loop,
  so a 409 can never silently stop a live block from saving.

### CRDT text on the ONE unified undo stack

- **Per-block `Y.UndoManager`, owned by the seam.** Each registry entry in
  `use-collab-block-doc.ts` creates one manager over the doc's content root, with
  tracked origins learned dynamically on `beforeTransaction`: anything that is
  neither the provider (server-applied state) nor an `UndoManager` (replays) is a
  local editing source — in practice exactly the `@lexical/yjs` binding, which is
  private to `CollaborationPlugin` and otherwise unreachable. Remote/echoed applies
  therefore never enter a block's text history. `CollaborationPlugin`'s own forced
  manager stays inert: its UNDO/REDO commands are swallowed at CRITICAL priority,
  while the native keydown still bubbles to the window-level shortcut.
- **Typing runs mirror 1:1 onto the shared stack.** The manager's `captureTimeout`
  (500 ms) folds a typing run into ONE item; each NEW item fires `onUndoableEdit`,
  which `recordTextEdit` records as one entry calling `um.undo()`/`um.redo()`.
  Deliberately NO `coalesceKey`: grouping already happened in the manager, and
  shared-stack coalescing would merge two entries over two manager items and break
  the 1:1 LIFO correspondence (`um.undo()` pops exactly one item). Thunks are
  generation-guarded on registry-entry identity, so a destroyed doc no-ops rather
  than popping a recreated manager's unrelated items.
- **Split/merge are ONE combined stack entry** (`recordStructuralWithDocEdit`): the
  structural patch pair AND the content-doc edit reverse/re-apply together, so rows
  and docs can never disagree after a single Cmd+Z. `captureBlockDocEdit` is the
  explicit capture boundary (`stopCapturing` on both sides + a suppress flag so the
  folded edit never double-records via the mirror); the surgery updates pass
  `discrete: true` so the binding's Yjs transaction lands synchronously inside that
  window, and `split` defers its capture one microtask because it runs from a
  Lexical command handler (a nested update would queue past the window). Merge also
  pins the restored source row's `data.text` to the LIVE merging runs
  (`undoTextOverride`) — the source doc was FK-cascaded with the row, so undo
  re-seeds from that row, which must be exactly what was un-appended from the
  target, not a projection-lagged snapshot. The unmounted-target merge records
  doc-level thunks instead.
- **Known degradations (consistent no-ops, never divergence):** redoing a text
  entry for a block whose creation was itself undone (doc destroyed + recreated →
  generation guard skips); undoing text in a block whose editor unmounted
  (collapsed ancestor — the manager died with the doc); a typing run within 500 ms
  after a non-doc structural op on the same block merging into the pre-op manager
  item (coarse grouping). All leave docs ≡ rows.
- **Inverse pairs need same-target cascade confirmation.** An undo patch followed by
  a redo patch before the undo's confirming push arrives leaves the undo op unable
  to ever confirm. Fixed in the `optimistic-mutation` primitive (SAME-TARGET cascade
  confirmation in `confirmPass` — see that plugin's CLAUDE.md); the editor declares
  op identity via `sameOverlayTarget` (block-id-set intersection), so the inverse
  pair cascades while an unrelated block's confirmation can never drop another
  block's still-pending op. Under the never-revert policy
  (`research/2026-07-11-global-never-revert-optimistic-edits.md`) there is no
  miss-limit eviction: the `op`/`patch` endpoints return their commit watermark
  (`currentTxId` read inside the write transaction), so an op leaves the overlay only
  for a causal reason. One that fails to converge stays rendered and files a
  `stalled` divergence report instead of un-splitting the user's block.

### Hardening

Validated against offline/reconnect, multi-tab, agent concurrency, and history
restore.

- **Doc-init is gated on the row being authoritative** (`rowConfirmed` →
  `markBlockRowConfirmed`, one-way, lifted push-based by the same blocks push that
  commits the row). A freshly split block mounts its editor from the optimistic
  overlay *before* the structural POST creates its `_blocks` row, so an ungated
  doc-init FK-violates and the `initStarted` latch wedges the block
  editable-but-never-synced. Local edits in the gap buffer in the doc and flush
  right after the seed. Any `initDoc` failure re-arms `initStarted`; a doc-init 404
  (block deleted — the server maps the FK violation to a clean 404) is a deliberate
  quiet TERMINAL stop, latching `blockGone` and dropping buffered bytes.
- **Seeds are deterministic, so pre-seeding is safe.** `runsToXmlText` takes a fixed
  Yjs `clientID` content-hashed from the runs JSON, so identical runs yield
  byte-identical encodings (and a mismatched seed can only duplicate, never corrupt
  by item-id collision). An UNCONFIRMED block therefore pre-applies its seed locally
  at `connect()` — hydrating synchronously instead of sitting EMPTY until
  confirm-push, where typing would merge badly with the later seed. The seed bytes
  are built ONCE per provider and reused for pre-apply and every doc-init retry,
  which must never post different bytes. The pre-seed DISCRIMINATOR is the
  provider's construction-time `blockRowConfirmed`, never an effect ordering: an
  existing block is confirmed from its first render, so it can never pre-seed over
  its stored doc (DUPLICATED text on reopen). Residual known edge: a keystroke
  < ~20ms after Enter can still be dropped (beyond human input;
  `@plugins/page/plugins/editor-collab`'s `e2e/split-typing-window-probe.ts`).
- **Split focus/caret under pre-seed.** The origin's deferred truncation carries
  `SKIP_DOM_SELECTION_TAG` (it is background surgery on the block the user is
  LEAVING; reconciling its cut-point selection would yank DOM focus back), and
  `focusHydratingAware`'s non-empty path passes `defaultSelection: "rootStart"`
  (a pre-seeded editor has no prior selection, and Lexical defaults to rootEnd).
- **Offline / reconnect: queue, never a retry timer.** Network-level seed/flush
  failures (fetch rejects, no HTTP status) are an expected local-first state — bytes
  re-queue at the head and retry on the live-state socket's reopen, the browser's
  `online` event (an idle WS may not surface a close promptly), the next server
  push, or the next local edit. Unexpected HTTP errors still throw loudly. Teardown
  is loss-safe: the registry's deferred destroy finalizes only when the provider is
  `readyForTeardown` (queue drained, or block server-confirmed gone), so an unmount
  during a transient outage RETAINS the entry and drains on the next reconnect edge.
  Known edge: closing the TAB while offline loses the last unflushed edits — the same
  class as an unflushed autosave.
- **The `data.text` projection dispatches `updateOnly` patches**
  (`BlockPatch.updateOnly`): an upsert whose row is gone is skipped on BOTH the
  client overlay and the server writer, and `isPatchReflected` treats it as
  vacuously absorbed so the op confirms instead of sticking. Otherwise a debounced
  projection flush racing a history restore (or another tab's delete) resurrects the
  deleted row with pre-delete text.
- **History restore.** `replacePageContent` mints fresh block ids, so a restore is
  automatically doc-consistent (the wipe FK-cascades every old `page_block_docs`
  row; pending flushes 409 → doc-init probe 404s → quiet terminal drop; the restored
  rows seed fresh docs from the restored `data.text`). Read the invariant note on
  `replacePageContent` before ever preserving ids there.
- **Dormant positional-truncation hazard (offscreen-merge undo).**
  `truncateBlockDocFrom` truncates the target doc POSITIONALLY, from the join offset
  to the doc end, so under a FUTURE virtualized + multi-writer target a concurrent
  append past that offset would be lost. Dormant today (the page editor doesn't
  virtualize). The correct fix is CRDT-relative — a delete-set over the appended
  items, not an offset range — deferred until virtualization exists.

## In-memory mode (`persist={false}`)

`<BlockEditor persist={false} initialContent={…} enabledBlockTypes={…}>` is a
self-contained, non-persisting editor: no `pageId`, no server rows, no network. It
powers throwaway surfaces (the public-site editor demo, drafts, previews, tests);
the whole document lives in React state and is discarded on unmount.

- **One persistence seam (`web/block-store.ts`).** `BlockEditorProvider` reads and
  writes ALL structure through a `BlockStore`; everything else in the provider
  (recording/undo, focus, `makeBlockAPI`, the CRDT projection) is storage-agnostic.
  `useMemoryBlockStore` is an authoritative synchronous `useState<Block[]>` reusing
  the SAME pure reducers/forest helpers as `useServerBlockStore`, so op/patch/insert
  semantics are byte-identical to the server. In memory `serverData === data`
  (every row is authoritative from the start, so the doc-init FK gate is inert).
- **The store owns rank authority.** `move` takes positional intent
  (`zone`/`targetId`) plus the provider's `computeDrop` rank PREDICTION. The server
  store ships only the intent — no caller may hand the server a rank, because
  `page_blocks`' single `(parent_id, rank)` ordering space is projected disjointly
  by several live resources. The memory store has no such split (one synthetic
  page, holding the forest whole), so the prediction IS its authoritative key.
- **Local-only content docs.** The context flag `serverSync` is the ONE place the
  editor knows whether content docs sync. `CollabTextPlugin` branches on it: the
  in-memory path uses `useLocalCollabBlockDoc` with `LocalYjsProvider`, a purely
  local per-block `Y.Doc` seeded from `data.text` at `connect()` that NEVER networks
  — no subscription (which would also need a `NotificationsProvider` the demo does
  not mount), no doc-init/doc-update. The projection + undo-capture observers fire
  identically, so text edits still ride the unified undo stack. Both hooks return
  the same `CollabBlockDoc`, so `CollabBinding` reports to the sync-status cloud on
  either transport — the local provider is permanently `idle`, aggregating to
  silence.
- **Attachments gated.** `allowAttachments` is `serverSync`: image/video/file/…
  blocks need a server to store blobs, so memory mode excludes them from the
  palette (`enabledBlockTypes`) AND skips the file-drop / paste-file paths.
- **`Editor.TurnInto` gated.** A `TurnInto` contribution converts a block into
  something the pure `convertTo` cannot express — a server-backed transition
  (today: into a sub-page, re-partitioning `page_id` across a page boundary). The
  block-actions menu renders that whole zone only when `serverSync`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Block-based document editor component and slot system. Block-based document editor — tables, routes, and live state.
- Web:
  - Slots:
    - `Editor.Block` ← `page.audio`, `page.bookmark`, `page.bulleted-list`, `page.callout`, `page.code-block`, `page.context`, `page.divider`, `page.embed`, `page.file`, `page.heading.heading-1`, `page.heading.heading-2`, `page.heading.heading-3`, `page.image`, `page.math.equation`, `page.numbered-list`, `page.page-link`, `page.prompt.block`, `page.quote`, `page.sub-page`, `page.text`, `page.to-do`, `page.toggle`, `page.video`
    - `Editor.BlockFrame` ← `page.callout`, `page.context`
    - `Editor.TurnInto` ← `page.turn-into-page`
    - `Editor.FormatAction` ← `page.formatting.bold`, `page.formatting.code`, `page.formatting.color`, `page.formatting.italic`, `page.formatting.link`, `page.formatting.strikethrough`, `page.formatting.underline`
  - Uses:
    - `infra/endpoints.EndpointError`
    - `infra/endpoints.fetchEndpoint`
    - `infra/endpoints.useEndpointMutation`
    - `primitives/css/badge.Badge`
    - `primitives/css/center.Center`
    - `primitives/css/inline.Inline`
    - `primitives/css/overlay.Overlay`
    - `primitives/css/pin.Pin`
    - `primitives/css/row.Row`
    - `primitives/css/spacing.Inset`
    - `primitives/css/spacing.insetClass`
    - `primitives/css/spacing.Stack`
    - `primitives/css/surface.Surface`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/viewport-overlay.ViewportOverlay`
    - `primitives/icon-button.IconButton`
    - `primitives/icon-picker.SvgIcon`
    - `primitives/latest-ref.useEventCallback`
    - `primitives/latest-ref.useLatestRef`
    - `primitives/live-state.liveStateSocketKind`
    - `primitives/live-state.useResource`
    - `primitives/loading.Loading`
    - `primitives/multi-select.MultiSelectProvider`
    - `primitives/multi-select.SelectionBar`
    - `primitives/multi-select.useMultiSelect`
    - `primitives/multi-select.useMultiSelectItem`
    - `primitives/networking.subscribeWsStatus`
    - `primitives/optimistic-mutation.OpNoLongerApplies`
    - `primitives/optimistic-mutation.useOptimisticResource`
    - `primitives/popover.InlinePopover`
    - `primitives/popover.InlinePopoverProps`
    - `primitives/scroll-reveal.useRevealOnActive`
    - `primitives/select-scope.ContentScope`
    - `primitives/slot-render.defineDispatchSlot`
    - `primitives/slot-render.defineOrderedDispatchSlot`
    - `primitives/slot-render.defineRenderSlot`
    - `primitives/slot-render.OrderedDispatchContribution`
    - `primitives/sync-status.useReportSync`
    - `primitives/text-editor/caret-trigger.atWordBoundary`
    - `primitives/text-editor/caret-trigger.CaretTriggerMenu`
    - `primitives/text-editor/caret-trigger.useCaretMenu`
    - `primitives/text-editor/caret-trigger.useCaretQuery`
    - `primitives/text-editor/caret-trigger.useForcedCaretQuery`
    - `primitives/undo-redo.useScopedUndoRedo`
    - `reorder.isNodeData`
    - `reorder.TopLevelEntry`
    - `reorder.useReorderedEntries`
  - Exports (types):
    - `BlockAnchorProps`
    - `BlockContribution`
    - `BlockEditorAPI`
    - `BlockEditorHandle`
    - `BlockFrameMeta`
    - `BlockFrameProps`
    - `BlockPasteHandler`
    - `BlockRendererProps`
    - `BlockSection`
    - `BlockTextExtension`
    - `BlockTextPluginProps`
    - `CaretSurface`
    - `CaretSurfaceRef`
    - `FormatToolbarValue`
    - `MarkButtonProps`
    - `PageIconProps`
    - `PageOption`
    - `PageOptionsResult`
  - Exports (values):
    - `BLOCK_INDENT`
    - `BLOCK_INSET`
    - `BlockEditor`
    - `BlockTextEditor`
    - `BlockTextRenderer`
    - `BlockTypeList`
    - `colorCssValue`
    - `Editor`
    - `filterBlockTypes`
    - `flattenSections`
    - `getBlockTextExtensions`
    - `isValidLinkUrl`
    - `MarkButton`
    - `MARKER_GUTTER`
    - `normalizeLinkUrl`
    - `OPEN_LINK_POPOVER_COMMAND`
    - `PageContentColumn`
    - `PageIcon`
    - `PageOptionsList`
    - `registerBlockPasteHandler`
    - `registerBlockTextExtension`
    - `useBlockAnchors`
    - `useBlockEditor`
    - `useFormatToolbar`
    - `useFramedBlockTypes`
    - `useGroupedInsertableBlocks`
    - `useInsertableBlocks`
    - `usePageOptions`
- Server:
  - Contributes:
    - `resource.declare` "pages"
    - `resource.declare` "page-blocks"
    - `page.block-data` "page"
  - Uses:
    - `database.currentTxId`
    - `database.db`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `infra/events.defineTriggerEvent`
    - `infra/trash._trashEntries`
    - `infra/trash.defineTrashSource`
    - `infra/trash.recordTrashEntry`
    - `primitives/rank.nextRankUnder`
    - `primitives/rank.rankAdjacentTo`
    - `primitives/rank.rankAfterSibling`
  - DB schema:
    - `plugins/page/plugins/editor/server/internal/tables-events.ts`
    - `plugins/page/plugins/editor/server/internal/tables.ts`
  - Exports (types):
    - `Block`
    - `BlockCreateHook`
    - `BlockDeleteHook`
    - `BlockRestoreHook`
    - `BlocksChangedPayload`
    - `BlockTrashHook`
    - `PageContentSnapshot`
    - `PageData`
    - `StoredBlock`
  - Exports (values):
    - `_blocks`
    - `BlockLifecycle`
    - `blocksChanged`
    - `BlockSchema`
    - `blocksLiveResource`
    - `deleteBlocksSubtree`
    - `Editor`
    - `PAGE_BLOCK_TYPE`
    - `pageData`
    - `PageDataSchema`
    - `pagesLiveResource`
    - `replacePageContent`
    - `serializePageContent`
  - Register:
    - `defineTriggerEvent('page.blocksChanged')`
    - `defineTrashSource('pages')`
  - Routes:
    - `GET /api/pages`
    - `GET /api/pages/:pageId/blocks`
    - `POST /api/blocks`
    - `PATCH /api/blocks/:id`
    - `DELETE /api/blocks/:id`
    - `POST /api/blocks/:id/move`
    - `POST /api/blocks/:id/turn-into-page`
    - `POST /api/pages/:pageId/blocks/op`
    - `POST /api/pages/:pageId/blocks/patch`
    - `POST /api/pages/:pageId/blocks/bulk-delete`
    - `POST /api/pages/:pageId/blocks/bulk-move`
    - `POST /api/pages/:pageId/blocks/bulk-duplicate`
- Core:
  - Uses:
    - `infra/endpoints.defineEndpoint`
    - `infra/trash.TrashOutcomeSchema`
    - `primitives/collab-doc.readYDoc`
    - `primitives/collab-doc.yDocContent`
    - `primitives/collab-doc.yDocFromLexical`
    - `primitives/live-state.resourceDescriptor`
    - `primitives/rank.Rank`
    - `primitives/rank.RankSchema`
    - `primitives/tree.isDescendant`
    - `primitives/tree.selectionRoots`
    - `primitives/tree.subtreeIds`
  - Exports (types):
    - `Block`
    - `BlockData`
    - `BlockDiff`
    - `BlockHandle`
    - `BlockMarkdown`
    - `BlockNode`
    - `BlockOp`
    - `BlockOpContext`
    - `BlockPatch`
    - `BlockTextVariant`
    - `BulkDeleteBlocksBody`
    - `BulkDuplicateBlocksBody`
    - `BulkMoveBlocksBody`
    - `BulkMovePlacement`
    - `BulkMovePlan`
    - `BulkMoveRefusal`
    - `ColorToken`
    - `CreateBlockBody`
    - `IdentifiedBlock`
    - `Mark`
    - `MdParseCtx`
    - `MdSerializeCtx`
    - `MoveBlockBody`
    - `PageCover`
    - `PageData`
    - `PageRow`
    - `RichText`
    - `RunsTokenExtension`
    - `RunsXmlTextOptions`
    - `SerializedBlock`
    - `TextBearingSchema`
    - `TextData`
    - `TextRun`
    - `TurnIntoPageBody`
    - `UpdateBlockBody`
  - Exports (values):
    - `applyBlockOp`
    - `applyBlockOpEndpoint`
    - `applyBulkMove`
    - `BlockOpSchema`
    - `BlockPatchSchema`
    - `BlockSchema`
    - `blocksResource`
    - `bulkDeleteBlocks`
    - `BulkDeleteBlocksBodySchema`
    - `bulkDuplicateBlocks`
    - `BulkDuplicateBlocksBodySchema`
    - `bulkMoveBlocks`
    - `BulkMoveBlocksBodySchema`
    - `canIndent`
    - `canOutdent`
    - `childrenOf`
    - `coalesce`
    - `COLOR_TOKENS`
    - `colorCssValue`
    - `createBlock`
    - `CreateBlockBodySchema`
    - `defaultTextHandle`
    - `defineBlock`
    - `deleteBlock`
    - `diffBlocks`
    - `IdentifiedBlockSchema`
    - `isEmptyPatch`
    - `listBlocks`
    - `listPages`
    - `MARK_ORDER`
    - `mergeRuns`
    - `moveBlock`
    - `MoveBlockBodySchema`
    - `nextVisibleLine`
    - `opBlockIds`
    - `PAGE_BLOCK_TYPE`
    - `pageBlockHandle`
    - `PageCoverSchema`
    - `pageData`
    - `PageDataSchema`
    - `PageRowSchema`
    - `PAGES_TRASH_SOURCE`
    - `pagesResource`
    - `parseMarkdownToForest`
    - `pasteAnchorId`
    - `patchBlocks`
    - `patchesFromDiff`
    - `plainOf`
    - `planBulkMove`
    - `planForestInsert`
    - `prevVisibleLine`
    - `rankWindow`
    - `RichTextSchema`
    - `runsLength`
    - `runsOf`
    - `runsOfNode`
    - `runsToLexical`
    - `runsToXmlText`
    - `serializeBlockRuns`
    - `SerializedBlockSchema`
    - `serializeForestToMarkdown`
    - `serializeSubtree`
    - `sortMarks`
    - `splitRuns`
    - `SvgNodeSchema`
    - `textBlockSchema`
    - `textDataSchema`
    - `textOf`
    - `TextRunSchema`
    - `tokenOf`
    - `turnIntoPage`
    - `TurnIntoPageBodySchema`
    - `updateBlock`
    - `UpdateBlockBodySchema`
    - `withMintedIds`
    - `withRuns`
    - `xmlTextToRuns`
- E2e:
  - Uses:
    - `framework/tooling/e2e-harness.arg`
    - `framework/tooling/e2e-harness.baseUrl`
    - `framework/tooling/e2e-harness.report`
    - `framework/tooling/e2e-harness.snap`
    - `framework/tooling/e2e-harness.withBrowser`
  - Exports (types):
    - `BlankDoc`
    - `CaretState`
    - `OpenBlankPageOptions`
  - Exports (values):
    - `blockIdOf`
    - `blockText`
    - `caretState`
    - `editableBlocks`
    - `openBlankPage`
    - `pageIdFromUrl`
- Cross-plugin:
  - Imported by:
    - `apps/pages/agent-origin`
    - `apps/pages/content-search`
    - `apps/pages/history`
    - `apps/pages/page-tree`
    - `apps/pages/starred`
    - `apps/pages/welcome/recent-pages`
    - `apps/story/marker`
    - `apps/story/shell`
    - `apps/story/story-core`
    - `apps/website/demos/editor-toy`
    - `page/attachment-block`
    - `page/audio`
    - `page/bookmark`
    - `page/bulleted-list`
    - `page/callout`
    - `page/code-block`
    - `page/container`
    - `page/context`
    - `page/divider`
    - `page/editor-collab`
    - `page/embed`
    - `page/file`
    - `page/formatting/bold`
    - `page/formatting/code`
    - `page/formatting/color`
    - `page/formatting/italic`
    - `page/formatting/link`
    - `page/formatting/strikethrough`
    - `page/formatting/underline`
    - `page/heading/heading-1`
    - `page/heading/heading-2`
    - `page/heading/heading-3`
    - `page/image`
    - `page/inline-date`
    - `page/inline-page-link`
    - `page/links`
    - `page/math/equation`
    - `page/math/inline`
    - `page/numbered-list`
    - `page/page-link`
    - `page/prompt/block`
    - `page/quote`
    - `page/read-only-view`
    - `page/sub-page`
    - `page/text`
    - `page/to-do`
    - `page/toggle`
    - `page/turn-into-page`
    - `page/url-paste`
    - `page/video`
  - Extended by:
    - `apps/pages/agent-origin` (table `page_blocks_ext_origin`)
    - `apps/pages/starred` (table `page_blocks_ext_starred`)
    - `apps/story/marker` (table `page_blocks_ext_story`)
  - Endpoint callers: `editor-collab`

<!-- AUTOGENERATED:END -->
