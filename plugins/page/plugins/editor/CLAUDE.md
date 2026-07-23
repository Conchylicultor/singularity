# editor

## The sidebar's ordering space is `docRank`, not `rank`

`page_blocks.rank` is a fractional index, and a fractional index is comparable
**only within one `(parent_id, rank)` space**. The Pages sidebar's sibling group
is *pages sharing a `pageId`* — which can span several such spaces: some
sub-pages are direct children of their page, others sit under a text line or a
toggle. Sorting those `rank` strings against each other is meaningless, and two
pages in different spaces legitimately hold the same rank (`"a1"` under a toggle,
`"a1"` under the page) — which fed `Rank.between("a1", "a1")`, threw inside
`computeDrop`, and silently aborted the drag.

So the **server** defines the order. `pagesLiveResource` emits a `PageRow` =
`Block` + **`docRank`**: a real minted `Rank`, unique and ordered within one
`pageId` group, derived from true document order by `docOrderPaths()` (an upward
rank-path CTE, sorted in JS). Rows come back in that order, so **display order,
array order, and `computeFlatReorder`'s rank-sorted neighbourhood are one order**
— they silently disagreed before. See
[`research/2026-07-16-page-sidebar-document-order.md`](../../../../research/2026-07-16-page-sidebar-document-order.md).

Three rules:

- **Never write `docRank` back.** It is derived per load: no column, no
  migration, never in a request body. It is only valid against the group it was
  minted with, and the *same row* read through `blocksResource` carries no
  `docRank` at all — persisting it would give one row two conflicting ranks.
  `rank` remains the storage key; moves send **positional intent** (an anchor
  id) and the server mints the real rank against the complete sibling set.
- **Membership is never a function of the traversal.** The loader's driving
  relation is the plain drizzle select; the path map is looked *onto* it. A page
  whose path can't resolve keeps its row (sorted last in its group, by raw
  `rank`) — dropping it would remove the page from the `[[` picker, breadcrumbs,
  the story gallery and the blog panel, not merely mis-order the sidebar.
- **Don't move the sort into SQL.** `rank_text` is `TEXT COLLATE "C"`, but a
  recursive CTE can flatten the domain back to plain `text` and revert to locale
  collation, where `'a' < 'B'` while `Rank.compare` says `'B' < 'a'`.

`docRank` derives from **ranks, not content** — which is why the ~1s
`data.text` projection re-runs this loader on every keystroke burst and yields a
byte-identical result, hence an empty diff and no push.

The unresolved-path branch is reachable only from corruption, not from a user
journey: delete cascades **across page boundaries** (`collectBlockSubtrees`), so
`A ⊂ B` trashes `A` with `B` under `B`'s single trash entry; restoring `A` alone
hits `untrashBlocks`' `parentGone` branch and re-parents it to the workspace
root. A live page therefore can never point at a trashed parent.

## The page column (one owner for the content-left edge)

`web/internal/page-column.ts` is the **single declaration site** for the column's
horizontal geometry. The invariant:

> A page's block content box has a left edge `C`.
>
> - Block **decorations** start at `C`: the quote's left border, the callout tint,
>   the code background, the image, the divider rule, the selection highlight, the
>   diff rail.
> - Block **content** (text, media) insets from `C` by `BLOCK_INSET`.
> - Anything a host renders *alongside* blocks that is not itself a block — the
>   page title, the page icon, the section list — sits at `C + BLOCK_INSET`.

The editable surface reserves the hover rail (`BLOCK_GUTTER`, 64px) to the **left**
of `C`, inside each row's own padding so the `+` / drag / chevron controls are
hoverable. That rail is editable-surface-only: `read-only-view` has no rail, so its
`C` is simply the renderer's left edge. `BLOCK_INSET` is shared by both.

**Hosts never compute the edge.** `BLOCK_GUTTER` is deliberately *not* exported from
the web barrel — a host that adds it to whatever padding its own wrapper carries is
exactly how the title and the block text drifted onto different edges (and why the
residual gap moved with the density preset). Instead:

- Editable page surface → wrap chrome in **`<PageContentColumn>`** (rail + inset).
- Read-only surfaces (blog post, version-history preview) → wrap chrome in
  `<Inset x={BLOCK_INSET}>`; `<ReadOnlyBlocks>` stays flush at `C`.
- A new block type gets the inset via `<Inset x={BLOCK_INSET} y="…">`. Vertical
  padding is *not* part of `BLOCK_INSET` — it differs per block.

Never splice a ramp step into a class name (`` `pl-${BLOCK_INSET}` ``): Tailwind emits
an `@utility` only for literal tokens it can scan. Use `<Inset>`, or `insetClass()`
from the spacing primitive when you only have a `className`.

Two known deviations from the invariant, both pre-existing: the callout tint and the
code background sit at `C + BLOCK_INSET` rather than bleeding to `C` (their `px`
wrapper is outside the decoration), and the quote's 2px border pushes its text to
`C + 2 + BLOCK_INSET`.

## The caret does not stop at the editor's edge (`CaretSurface`)

A page is not just the block list: the title sits above it, outside the provider.
Yet the caret must flow across that seam the way it flows between two blocks —
ArrowUp / ArrowLeft / Backspace at the top of the body land in the title, and
Enter / ArrowDown / ArrowRight in the title land in the body (Notion's model).

The seam is one contract, `web/caret-surface.ts`:

```ts
interface CaretSurface {
  focus(): void;                                     // required
  focusBoundary?(edge: "start" | "end"): void;       // land at my very start/end
  focusAtColumn?(x: number, edge: "top" | "bottom"): void;  // preserve the pixel column
}
```

Everything that can hold a caret implements it, and nothing else is needed to
participate:

- **Blocks** — `BlockFocusHandle extends CaretSurface`, registered per block id.
  It widens the surface with the members only a doc-bound text editor can offer
  (`focusOffset`, `truncateAt`, `appendRunsAtEnd`).
- **The block list as a whole** — `BlockEditorHandle extends CaretSurface`, the
  host-facing imperative ref. `focusBoundary("start")` opens the top of the body.
- **Host chrome** — the page title (`apps/pages/page-tree`) implements it over an
  `<input>` and hands its ref to `<BlockEditor caretBefore>` (`caretAfter` exists
  symmetrically; nothing uses it yet). A host that passes neither — the story
  shell — simply gets a caret that stops at the first/last block, as before.

Two rules keep this from leaking:

- **`landCaret` is the one landing policy** (`internal/caret-landing.ts`): vertical
  crossings preserve the pixel column *when the surface can honor it*, horizontal
  crossings land on the boundary they were travelling toward, and a surface that
  offers neither refinement just takes `focus()`. `navigate()` calls it for a block
  and for host chrome with the same arguments — it never branches on which. A
  one-line surface (the title) therefore omits `focusAtColumn` and is entered at its
  end, with no special case anywhere.
- **`focus()` restores, it does not place.** The bare `focus()` member means
  "give this surface the keyboard back"; an editor that already holds a caret
  keeps it exactly where it is, and only a *selection-less* one (a fresh
  split/insert) is landed at its content start. `focusHydratingAware` funnels
  both of its paths (hydrated / still-empty) and both scroll modes through one
  `focusRestoringSelection`, which is Lexical's own `editor.focus()` policy —
  mark an existing selection dirty so the reconciler writes it back, else apply
  the `rootStart` default. The no-scroll arm has to hand-roll that (there is no
  `preventScroll` on `editor.focus()`), and while it hand-rolled only the
  *second* half — an unconditional `$getRoot().selectStart()` — every structural
  op that re-focuses the block the user is standing in silently sent the caret
  home: `Tab`/`Shift+Tab` (whose executors call `focusBlock` after the move) were
  a caret-to-start keystroke. **A caller that wants a specific position says so**
  — `focusBoundary(edge)` / `focusOffset(n)`, which is why the empty-background
  click lands through `focusBlockBoundary` in all three of its branches rather
  than leaning on a side effect of `focus()`. `e2e/indent-caret-verify.mjs` is
  the executable spec (indent + outdent, caret parked mid-word).
- **`resolveKeystroke` never learns about the boundary.** Backspace at the start of
  the first top-level block has no block to merge into, so it resolves to exactly
  what ArrowLeft there resolves to — `{ type: "nav", dir: "left" }`. Whether a
  surface is waiting on the other side is the executor's business. That is why
  "Backspace goes back to the title" needed no new intent, no new op, and no new
  branch in the resolver.

## Visible-line invariants (Enter / Backspace / Delete)

Split, merge, and the keystroke ladders are all restatements of one fact
the codebase already derives everywhere else (`prevVisibleLine`/`nextVisibleLine`,
the indent/outdent folds, `pasteAnchorId`) but split and the ladders hadn't caught
up to: the user's mental model, and the caret's, is the **visible line
sequence**, not sibling space (`parentId`+`rank`).

> Split turns one visible line into two adjacent visible lines: the tail
> becomes the immediately-next visible line; no other line changes position or
> depth. Merge is its exact inverse.

**Adoption rule** (`applySplit`'s non-`asChild` arm, `core/block-ops.ts`): when
the origin has *visible* children (`block.expanded && childrenOf(...).length >
0`), the tail adopts all of them — reparented to the new id, ranks preserved
byte-for-byte (the whole sibling set moves together) — and the tail is opened
(`expanded: true`). Collapsed children are not visible lines, so they stay with
the head, which deliberately keeps its own `expanded: true` even with zero
children afterward (harmless — no chevron without children — pinned by test as
a decision, not an oversight).

Adoption is **derived inside the reducer from the current forest state**,
never carried on the op as a flag minted at intent time: ops apply against the
CURRENT forest — the optimistic overlay replays onto a refreshed base, and the
server applies against its own load — so a flag frozen when the keystroke fired
could contradict the forest by the time the op actually applies (e.g. a racing
collapse). Deriving keeps the invariant true *at the moment of application*,
byte-identical whether the caller is the keyboard, the memory store, or the
fuzzer. It mirrors `applyMerge`'s own children-adoption exactly: after an
adoption-split the head is childless, so `prevVisibleLine(tail)` resolves back
to the head, and a following merge re-adopts — which is what makes split and
merge round-trip. `split ∘ merge round-trip`'s "split a random content block
then merge the tail restores the forest structurally (~500 seeds)" is the
executable spec; equality there is **structural** (canonical `{parentId, type,
expanded, childIds order, coalesced runs}` per id) — merge mints fresh ranks on
every adoption, so comparing rank strings would fail even on a correct
round-trip.

**Enter at the START of a non-empty block preserves the origin's identity.**
When the caret is at offset 0 and the block has text after it, split does NOT
empty the origin into a fresh `newId` — it inserts an **empty sibling ABOVE**
and leaves the origin completely untouched: same id, full text, children
subtree, content doc, `data`, and `expanded`. The caret stays put in the origin
(the Enter keydown is `preventDefault`ed, so DOM focus never leaves), so there is
no `focusNew` and no origin-doc `truncateAt` — the executor records a plain
structural entry whose undo/redo both land on the origin. The discriminator is
`op.position === 0 && afterRuns.length > 0` (equivalently `runsLength(runs) > 0`
at position 0), which distinguishes it from **empty-block Enter** (position 0 but
nothing after the caret), which keeps spawning a plain empty sibling BELOW and
moves the caret down. Both the pure reducer (`applySplit`) and the web executor
(`makeBlockAPI().split`) branch on the *same* condition — the executor branch is
load-bearing, not cosmetic: it skips the origin's live-doc `truncateAt(0)` that
would otherwise wipe the whole content doc. Why it matters: the origin's **block
id never changes**, so every block-id-keyed thing — the content-doc registry
(`block id ⇒ Y.Doc`), the per-block `Y.UndoManager`, undo focus routing — stays
stable instead of churning to a new id. Notion's model. See
[`research/2026-07-22-page-enter-at-start-identity-preservation.md`](../../../../research/2026-07-22-page-enter-at-start-identity-preservation.md).

The keystroke ladders (`web/internal/keystroke-intent.ts`) apply the same
visible-line idea to deletion and to escaping structure:

> **Backspace** deletes the nearest visible thing to the LEFT of the caret:
> marker glyph (convertTo) → indentation (outdent) → line break (merge) →
> boundary (nav-left).
>
> **Delete** deletes the nearest visible thing to the RIGHT of the caret:
> the line break below (merge the next visible line up) → boundary (nav-right).
>
> **Empty-Enter** escapes one structural level per press: indentation first
> (outdent, keeping the type), then the type (convertTo), then ordinary split.

Backspace's and empty-Enter's ladders order `convertTo`/`outdent`
**oppositely, deliberately**: Backspace strips what's visually nearest the caret
(the marker sits right there), while empty-Enter escapes nesting outward (the
type is the outer layer). The `Backspace`, `Delete`, and `Enter` describes in
`keystroke-intent.test.ts` pin every rung; `trajectories` re-resolves a fixture
across repeated keystrokes as the multi-step spec (`Backspace: formatted nested
block → [convertTo, outdent, merge]`, `empty-Enter: empty bullet nested two deep
→ [outdent, outdent, convertTo, split]`, `Delete: block with a subtree →
[mergeNext, mergeNext, nav]`, etc.).

**A ladder is only as good as the caret context feeding it.** Every rung is gated
on `caret.atStart` / `caret.atEnd`, so `readCaretContext` must never report an
offset it did not actually resolve: an unresolvable anchor returns **null** — no
caret context at all, so the keystroke passes through — never `offset: 0`
alongside `atStart: false`, a self-contradicting context that silently demotes
*every* structural keystroke to a passthrough. The case that proved it: Lexical
anchors a selection on the **ROOT** (`{key: "root", type: "element"}`) whenever
the selection first materializes while the root is still childless — the normal
state of a freshly split/inserted block, whose editor takes DOM focus before the
content doc bootstraps the empty paragraph in (`focusHydratingAware`), and which
never re-anchors itself afterwards. A root anchor is a legal *document-level*
position ("before the Nth paragraph"), so `$linearCaretOffset` resolves it as
one; while it returned null instead, Backspace-at-start in a brand-new empty
block was a dead keystroke until some other edit moved the anchor down into the
paragraph — the first press did nothing, the second outdented.

**Delete's ladder is deliberately one rung, and that is not an omission.**
Backspace's ladder is long only because the *current* block's own marker and
indentation sit physically between the caret and the line break above it. To the
right of a caret at end-of-line, nothing sits between it and the line break — the
next block's marker and indent are *after* that break, so they are not nearer.
"Completing" Delete's ladder with a `convertTo`/`outdent` rung would make Delete
take three presses to remove one line break, which no editor does.

**Delete needs no new reducer op — it is Backspace's merge from the opposite
originating block.** Delete-at-end of X ought to be exactly Backspace-at-start of
the next visible line, and that identity is well-defined only because
`prevVisibleLine(nextVisibleLine(X)) === X` for every X with a next line (the
`duality` property test over the fuzz forest is the executable spec). Completing
the duality required two things: `prevVisibleLine` (renamed from
`prevVisibleLeaf` — it can now return a *parent*, not only a leaf) gained the
**upward branch** — a first child's previous visible line is its parent — and its
dual `nextVisibleLine` was added (first visible child, else the nearest following
sibling walking up). With that, the resolver's `mergeNext` intent resolves the
source to `nextVisibleLine(this)` and merges it up through the SAME `mergeBlock`
path Backspace uses; the append lands in the currently-focused editor and the
caret sits at the join — i.e. it does not move, which is what forward-delete must
do. The source is a *different* block, so its live runs are read through the new
`BlockFocusHandle.readRuns` (the read dual of `appendRunsAtEnd`); falling back to
the ~1s-lagged `runsOfNode` projection is reserved for **text-less** blocks
(divider/image/file/embed) that register no handle, where empty runs are the true
answer, not an absorbed miss.

**`applyMerge`'s adoption slot follows the same visible-line rule.** Adopted
children occupy the visible position the merged block occupied: when the target is
the merged block's own PARENT (the upward `prevVisibleLine` case — the block is
therefore the first child) they land BEFORE the block's former next siblings
(`Rank.nBetween(null, nextSibling(source)?.rank ?? null, n)`); otherwise (target
is a prev sibling's deepest leaf, nothing of the target's follows) they append
after the target's existing children, as before. Both `PAGE_BLOCK_TYPE` refusals
still hold, now also covering "the parent is the page row".

**`dataOnSplit` seam** (checked to-do → unchecked tail, generalized): declared
on the block handle in **method syntax** — the same bivariance trap `text`
documents in `define-block.ts` (a property-typed function is contravariant in
`data` and breaks `BlockHandle<unknown>` registry assignability). Resolved in
the **resolver**, not the reducer or the executor, because only the resolver
sees block handles; guarded to `tailType === node.type` — a heading→text
end-split must never run the heading's transform against the text schema. The
result is carried as `op.tailData` because the pure reducer cannot see handles
at all; absent means inherit (today's behavior). Bad payloads are still caught
at the write boundary by the existing strict `parseBlockData` — the seam adds
no new validation surface.

`opBlockIds`' split case stays `[blockId, newId]`, deliberately omitting
adopted children — the same documented under-approximation as merge's
rewritten target: less cascade-confirmation coverage, but never a wrong drop.

## Block-selection mode: the container handles only keys it originated

Block selection lives on `internal/use-block-selection.ts` — the range state, the
container's focus/keyboard policy, and the `SelectionControl` deep children
(`BlockRow`'s shift-click, `KeyboardPlugin`'s Esc / Shift+Arrow) drive it with. It
takes its structural surface as an `actions` prop rather than reading
`useBlockEditor()`, so it depends on nothing but React and the multi-select reducer
— which is what makes it mountable in jsdom (`web/__tests__/block-selection.test.tsx`).

The load-bearing invariant:

> The selection container's `onKeyDown` acts **only** on keystrokes whose
> `e.target` is the container itself. Never `document.activeElement`.

The container is an ancestor of every block's `contenteditable`, and React delegates
`onKeyDown` from the root — so a key a block already consumed still bubbles here
afterwards. Asking `document.activeElement === containerRef.current` is a TOCTOU:
`enterSelectionMode` *moves focus to the container* from inside the block's own
Lexical handler, mid-dispatch. The synchronous `focusin` is discrete, so React flushes
the pending range update and re-renders before the still-bubbling keydown arrives —
which then finds `activeElement === container` and `isActive === true`, claims the
event, and runs its own `Escape → clear` branch over the selection Escape just made.
Escape into selection mode was dead for exactly this reason, and Shift+Arrow at a
block edge extended the range twice off one keypress. `e.target` is fixed at dispatch
time and no handler can move it. See
[`research/2026-07-10-page-escape-block-selection.md`](../../../../research/2026-07-10-page-escape-block-selection.md).

The **clipboard** handlers in `block-editor.tsx` deliberately keep the
`activeElement` check — "does the container own the clipboard right now?" is a
genuine `activeElement` question, and a `copy` event's target follows the DOM
selection, not focus.

The second invariant, and the reason `focusContainer()` is not just a `.focus()`:

> Entering block-selection mode **relinquishes the text caret**. The mode owns the
> keyboard; no caret may stay parked in the block the user just left.

Focusing the container does not move the DOM selection, and Lexical re-derives every
commit's pending selection *from the DOM selection*. A caret left in a blurred block
therefore lets any **untagged** reconcile conclude "the caret didn't move, so my root
should have focus" and call `rootElement.focus()` — silently destroying the selection
a beat later, with no user input. Lexical guards this for its own collab updates
(`COLLABORATION_TAG`), but `@lexical/yjs` issues an untagged follow-up commit
(`$ensureEditorNotEmpty`) outside its own tagged block, which the guard never sees —
and being inside the library, it has no update-options seam to tag from outside (unlike
the app's own split-truncation, which tags itself with `SKIP_DOM_SELECTION_TAG` in
`collab-text-surgery.ts`). So `releaseCaret` drops the DOM selection instead: with no
caret, a reconcile has nothing to restore. Robust to ANY async refocus, not one
trigger. See
[`research/2026-07-17-page-block-selection-focus-steal.md`](../../../../research/2026-07-17-page-block-selection-focus-steal.md).

Consequence worth knowing before touching the selection bar: with no caret, a `copy`
provoked from a bar BUTTON has neither a selection for `execCommand("copy")` to fire
on, nor a path to the container's `onCopy` (the bar renders *outside* the container, so
the event targets the button). `copySelectionViaButton` handles both explicitly. Cmd+C
/ Cmd+X are unaffected — they originate inside the container.

jsdom cannot reproduce the mid-dispatch flush (React's sync-lane work lands on a
microtask that cannot run while the dispatch unwinds), so the unit test reaches the
same *state* across two keystrokes; `e2e/block-selection-verify.mjs` covers the
single-dispatch symptom in a real browser.

## The gutter `+` and `/` are one unified menu

The gutter `+` and the `/` slash command open the **same** caret-anchored block
menu (`components/block-menu-plugin.tsx`, mounted once per text block as
`BlockMenuPlugin`) — Notion's model. One `CaretTriggerMenu` surface, one keyboard
model, one filtered `BlockTypeList`; only the *producer* of the open-state
differs, and both are `CaretQuery` handles from the caret-trigger primitive:

- **`/` trigger** (`useCaretQuery`): typing `/` at a word boundary opens it; the
  text after the `/` filters it. On commit the `/query` is stripped in place and
  the block converts, keeping the text around the slash.
- **Gutter `+` draft** (`useForcedCaretQuery`): `useInsertBlockBelow` inserts an
  empty paragraph below, **focuses it** (`focus: true`), and flags it as the
  draft via `requestBlockMenu(newId)` on the block-editor context. That block's
  `BlockMenuPlugin` sees `blockMenuDraftId === blockId`, force-opens the same
  menu, and the block's OWN text before the caret is the inline filter. On commit
  the whole filter text (it was never content) is dropped and the block converts;
  `clearBlockMenu` closes the draft. Esc / outside-press keeps the block and
  clears the draft, so `+` then Esc is simply "new empty line below" rather than
  a click that did nothing.

While the draft menu is open the block's placeholder reads **"Type to filter"**
(`block-text-editor.tsx` swaps it in on `blockMenuDraftId === block.id`), because
the empty block's own text is now the filter field.

`blockMenuDraftId` on the context is the single source of truth for the draft's
open-state, so the flag and the menu can never disagree. The draft is born as the
type declaring `defaultText` (`page/text`), resolved via `defaultTextHandle` —
the editor core never names a block type.

There is deliberately **no bottom "Add block" button** (Notion has none either).
Every way to create a block already runs through a real block with a caret — the
gutter `+`, `/`, Enter, and the Notion-style click on the empty background below
the last block (`onEmptyClick`, which focuses a trailing empty paragraph or
appends one). A "pick, THEN create" popover would need its own `SearchInput`
because it has no block/caret to filter inline; the affordance and its picker
body were removed rather than re-aligned onto the content column. The turn-into
menu is not one of those: it renders `BlockTypeList` inline in the block-actions
popover, over a block that already exists.

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
  sibling list, so the next selected sibling's previous sibling becomes that same
  new parent: the run lands as consecutive children of the block above it. The
  guard is the other half — a block whose previous sibling is *itself a selected
  block that stayed put* refuses to move, so a leading block that cannot indent
  (it is the first child) holds its whole run in place instead of being nested
  into. Skipping cascades; a fully-refused op is an identity no-op.
- **`foldOutdent` — bottom-to-top.** `outdentOne` adopts the followers left below
  the block (Notion's outdent). Going bottom-up, every selected follower has
  already left by the time an earlier block moves, so only UNSELECTED followers
  are adopted, by the last selected block — exactly as outdenting that block alone
  would do. Top-down, the first block would swallow the rest of the selection as
  children.

Ranks are only comparable within a parent, so the folds sort their input with
`documentOrder` (a rank-ordered DFS) rather than trusting the caller's array order
or a global rank sort.

`dispatchOp` drops any op whose reducer diff is empty, so a refused Tab never
reaches the undo stack, the overlay, or the network. `canIndent` / `canOutdent`
run the same fold to drive the selection bar's disabled state — the affordance can
never disagree with what the key does.

## Undo / redo (one unified stack)

Undo/redo is wired through the generic
`@plugins/primitives/plugins/undo-redo/web` primitive. The editor **does not own
the stack**: the `<UndoRedoProvider>` is mounted once per surface tab by
`apps-core/tab-surface`, and the editor is one participant recording into it —
alongside the Pages sidebar, whose page-delete lands on the same chronological
history. There is a **single** document-level stack covering BOTH text and
structure — no per-block Lexical history.

- **The editor's entries are mount-scoped.** `BlockEditorProvider` records through
  `useScopedUndoRedo()`, so every entry it pushes is tagged with this editor's
  mount and **dropped from the stack when the editor unmounts**. Required, not
  cosmetic: its thunks close over the per-`pageId` optimistic store and the
  per-block `Y.UndoManager`s, which die with the doc — replaying one after unmount
  would be a no-op at best and a patch dispatched into another page's overlay at
  worst. Net effect (unchanged from when the provider lived here): edit page A,
  navigate to B, Cmd+Z does not reach back into A — a Miller `swap` remounts the
  column. Entries whose thunks are pure server calls (the sidebar's trash-restore)
  are unscoped and survive the navigation.
- **One stack, surface-level router (focus-independent).** There is no Lexical
  `HistoryPlugin` (it was retired — a per-block parallel history is a layering
  error: the `page_blocks` row tree, not a Lexical document, is the source of
  truth). Cmd+Z / Cmd+Shift+Z / Cmd+Y are NOT routed per-block, and NOT registered
  by the editor either: `TabSurface` mounts one `useUndoRedoShortcuts()` per tab,
  registering surface-scoped (`surfaceId`-gated, `enableInInputs`) bindings on the
  window-level `ShortcutManager` — one registration per surface, so the sidebar and
  the body cannot race for the same key id. They fire whenever this tab is focused,
  regardless of which DOM element holds the caret — a block contenteditable, the
  selection container, or `<body>` after a structural undo deletes the focused
  block. Nothing in `keyboard-plugin.tsx` / `block-editor.tsx`'s container
  `onKeyDown` consumes those keys, so the native keydown bubbles out untouched (no
  `HistoryPlugin` registers a Lexical `UNDO_COMMAND`). This replaces the old
  focus-dependent routing whose breakage — Cmd+Z reaching neither handler once
  focus fell to `<body>` — caused the original "redo does nothing" defect. Text and
  structure interleave in true chronological order.
- **Text edits are per-block `Y.UndoManager` items mirrored onto the stack.**
  Text history lives in each block's content doc: the content-doc seam's
  manager coalesces a typing run into ONE item, and `recordTextEdit` (in
  `block-editor-context.tsx`) mirrors each new item 1:1 as a shared-stack
  entry whose thunks call that entry's `um.undo()`/`um.redo()` (see the
  per-block CRDT section below). There is no `data.text` text-autosave path —
  rows only receive text through the debounced doc→`data.text` projection.
- **Command-pattern patches, not snapshots.** Recording happens at the mutation
  chokepoints in `block-editor-context.tsx`: snapshot `before = rowsRef.current`,
  compute `after`, `diffBlocks(before, after)` (pure, `core/block-diff.ts`), derive
  minimal forward/reverse `BlockPatch`es (`{ upserts, deleteIds }`), and `record`
  thunks that re-apply them onto the CURRENT state. `recordPatchEntry` is the shared
  helper (threads an optional `coalesceKey`); `recordStructural` calls it with none
  (structural ops never coalesce). Entanglement-safe — undoing an old action never
  clobbers later unrelated edits.
- **One single-row chokepoint (`commitRow`).** Every *single-row* mutation funnels
  through one internal helper — `commitRow(blockId, transform, opts)`: snapshot rows,
  apply `transform` to just that row, diff into a minimal patch pair, optionally
  `record` it (skipped when `opts.record === false`), then dispatch the forward patch
  through the same optimistic pipeline. `projectText`, `BlockEditorAPI.update`,
  `convertTo`, and `setExpanded` are all thin callers of it, so forward apply and
  undo/redo are symmetric by construction and a new block type's `editor.update(...)`
  is recorded automatically. (Multi-row structural ops still go through `dispatchOp`/
  `move`/`bulkDelete` + `recordStructural`.)
- **Same optimistic instance.** A `patch` overlay variant flows through the SAME
  `useOptimisticResource` as forward ops (instant overlay + reconcile), POSTing to
  `POST /api/pages/:pageId/blocks/patch` (`handle-patch-blocks.ts` — a blind
  row-level upsert+delete writer sharing the op handler's delete-lifecycle and the
  `notifyStructuralChange` notify path). Undo/redo thunks dispatch patches DIRECTLY
  (never through the recording wrapper), and the primitive's re-entrancy guard
  ignores `record` during replay. Bound editors never re-read `data.text` from a
  patch — content flows exclusively through the block's `Y.Doc`.
- **Non-text `data` edits ARE now recorded.** Every `BlockEditorAPI.update(data)`
  edit — to-do `checked`, callout color, image src, etc. — routes through the shared
  `commitRow` chokepoint (`coalesceKey: blockId`), so it is optimistic AND on the
  unified stack; `convertTo`'s forward apply now flows through the same patch pipeline
  as its undo/redo (no asymmetric `PATCH /api/blocks/:id` write). The editor no longer
  uses `updateBlock` at all (`handle-update-block.ts` stays for the page-level
  consumers: page title, sidebar expand, cover).
- **NOT recorded:** `setExpanded` only — pure view state, dispatched with
  `record: false` (Notion doesn't undo collapse/expand). It is still optimistic via
  the patch pipeline, just never pushed onto the stack.
- **Follow-up:** `bulkMove`, `bulkDuplicate`, and `paste` are NOT yet recorded —
  they mint server ids/ranks, so a clean inverse needs those endpoints to return
  their resulting rows (or to be diffed against the post-settle resource).
  `convertTo`, non-text `data` edits, single-block `move` (client-known rank),
  `bulkDelete`, and all `dispatchOp` ops are recorded with exact,
  purely-computed after-states; text edits are recorded as mirrored
  `Y.UndoManager` items.

## Per-block CRDT text (unconditional)

Per-block CRDT text is THE text pipeline
(`research/2026-07-07-page-per-block-crdt-plan-b.md`, Stages 0–5 complete —
the `crdtText` flag and the legacy `ValueSyncPlugin` + `useEditableField`
autosave path are deleted). Every `BlockTextEditor` binds to a **per-block
`Y.Doc`** through `@lexical/react`'s `CollaborationPlugin`
(`components/collab-text-plugin.tsx`, `id = block.id`,
`shouldBootstrap={false}`, `editorState: null`). Remote/echoed changes apply
as a Yjs **merge**, never a serialized-string rebuild — the historical
fast-typing cursor-jump/scramble bug is structurally impossible. Per Plan B,
**structure stays relational forever**: `page_blocks` rows remain the
authoritative tree, and the structural op/patch pipeline is unchanged.
Existing pages need no migration: a block whose content doc doesn't exist yet
lazy-seeds it from `data.text` on first mount (the first-writer-wins doc-init
path below).

The transport seam is `internal/use-collab-block-doc.ts` — the ONLY place the
editor knows how content docs sync. It ref-counts one `{ doc, provider }` per
block id (strict-mode double mounts and second readers share one doc; deferred
destroy on last release) and wires `internal/live-state-yjs-provider.ts`:
**in** = the `blockContentResource` keyed live subscription (`applyUpdate`
with provider origin — the echo guard), **out** = first-writer-wins
`doc-init` seeding (live doc hydrated ONLY from the server's authoritative
response — closes the duplicate-seed hazard) + debounced (~300 ms) `doc-update`
posts of merged local updates. A future delta-WS transport swaps in behind
`useCollabBlockDoc` and nothing else changes.

**Projection + content-doc-aware split/merge:**

- **`doc → data.text` projection.** `CollabTextPlugin`'s `useTextProjection`
  observes the block's `Y.Doc` (`doc.on("update")` via `useCollabBlockDoc`'s
  `onContentChange` — local + server-applied changes, push-based), debounces
  ~1 s, serializes the bound editor's runs (byte-identical to `xmlTextToRuns`
  on the doc — same walk, no headless replica), and writes changed runs
  through `projectText` (`commitRow` with `record: false` — Yjs owns text
  history, so the write never lands on the undo stack) into the shared
  optimistic patch pipeline (`POST /blocks/patch` + `blocksChanged` fan-out).
  Never echoes into the editor (`data.text` is only read once, as the doc-init
  seed); skip-if-unchanged bounds churn; flushes on unmount (never from a
  never-synced editor). Rows therefore trail the doc by ≤1 s — search /
  backlinks / history stay fresh.
- **Split (Enter)** keeps the row pipeline verbatim (reducer leaves the head
  in the origin row, seeds the new block's row with the tail — its content doc
  initializes from that on mount) and additionally truncates the ORIGIN
  block's live editor from the caret (`BlockFocusHandle.truncateAt` →
  `internal/collab-text-surgery.ts`), driven THROUGH LEXICAL so the collab
  binding syncs the deletion into the content doc with marks/tokens intact.
  The projection is existence-gated against the RENDER-FRESH optimistic rows
  (`liveRowsRef`), not `rowsRef`: a deleted block's unmount flush fires before
  the effect that refreshes `rowsRef`, and an ungated flush would upsert
  (resurrect) the just-deleted row.
- **Merge (Backspace-at-start)** appends the merging block's LIVE runs onto
  the target's bound editor (`BlockFocusHandle.appendRunsAtEnd` — Lexical
  `$appendRuns` + caret at the live join offset), then the structural merge
  deletes the block (its `page_block_docs` row FK-cascades). If the target's
  editor is NOT mounted (virtualized offscreen), a lossless doc-level fallback
  (`appendRunsToBlockDoc`: `doc-init` → headless `editYDocState` append →
  incremental `doc-update`) runs FIRST and the structural delete only fires
  after it lands — a failed append leaves both blocks intact.
- **The doc-update pipeline is what reports "Saved".** The provider derives a
  `saveState` (`idle | syncing | error` + `lastFlushedAt`) from its own queue
  and publishes it through a fifth listener registry (`onSaveState` /
  `getSaveState` — a memoized frozen snapshot, so a `useSyncExternalStore`
  consumer can never loop). `useCollabBlockDoc` returns it, and
  `CollabTextPlugin` — mounted exactly once per block — feeds it to
  `useReportSync({ label: "text" })`. One reporter per block; the surface's
  sync-status store aggregates them (`error > syncing > saved > idle`), so the
  cloud says "Saved" only once every dirty block's bytes are server-acked.
  `syncing` starts at the KEYSTROKE edge, not when the 300 ms debounce expires.
  **Offline is `syncing`, never `error`** — a network-level rejection re-queues
  at the head and retries push-based, so nothing is at risk; only a durable HTTP
  rejection (non-409 on `doc-update`, non-404 on `doc-init`) is an `error`, and
  it still throws loudly. `blockGone` is `idle` (the bytes were deliberately
  dropped; their content moved with the merge). `retrySave` clears the error and
  re-runs the flush. The `data.text` projection is deliberately NOT reported:
  it is derived denormalization (search / backlinks / doc seed) that dispatches
  through the optimistic pipeline, which reports on its own.
- A `doc-update` 409 after having been synced means the doc row vanished —
  usually FK-cascade-deleted (merge/delete) while a flush was in flight. The
  provider never guesses: it re-arms its init path and lets a doc-init probe
  arbitrate. 404 (block genuinely deleted) is a quiet terminal stop — the
  buffered bytes are deliberately dropped, their content already moved with
  the merge. Success (block ALIVE, row unexpectedly gone) recovers loudly:
  the row is re-created from the FULL local doc state (never the `data.text`
  seed, which would duplicate content the doc already holds) and the flush
  loop resumes — a 409 can never silently stop a live block from saving.

**CRDT text on the ONE unified undo stack:**

- **Per-block `Y.UndoManager`, owned by the seam.** Each registry entry in
  `use-collab-block-doc.ts` creates one manager over the doc's content root.
  Tracked origins are learned dynamically on `beforeTransaction`: anything
  that isn't the provider (server-applied state) and isn't an `UndoManager`
  (replays) is a local editing source — in practice exactly the
  `@lexical/yjs` binding, which is private to `CollaborationPlugin` and
  otherwise unreachable. Remote/echoed applies therefore never enter a
  block's text history. `CollaborationPlugin`'s own forced manager stays
  inert: its UNDO/REDO commands are swallowed at CRITICAL priority in
  `CollabTextPlugin` (the native keydown still bubbles to the window-level
  shortcut → the document stack).
- **Typing runs mirror 1:1 onto the shared stack.** The manager's
  `captureTimeout` (500 ms, matching the app's coalescing intent) folds a
  typing run into ONE stack item; each NEW item fires `onUndoableEdit`, which
  `recordTextEdit` records as one entry whose thunks call that entry's
  `um.undo()`/`um.redo()`. Deliberately NO `coalesceKey`: grouping already
  happened in the manager, and shared-stack coalescing would merge two
  entries over two manager items and break the 1:1 LIFO correspondence
  (`um.undo()` pops exactly one item). The correspondence argument: entries
  referencing one block's manager are recorded in item order, and the shared
  stack is LIFO — when an entry is popped, all later entries for that block
  were popped first, so the manager's top item IS the entry's item.
  Thunks are generation-guarded (registry-entry identity): if the block's doc
  was destroyed (block deleted, editor released) they no-op rather than
  popping a recreated manager's unrelated items.
- **Split/merge are ONE combined stack entry** (`recordStructuralWithDocEdit`):
  the structural patch pair AND the content-doc edit reverse/re-apply
  together, so rows and docs can never disagree after a single Cmd+Z.
  `captureBlockDocEdit` is the explicit capture boundary: `stopCapturing` on
  both sides + a suppress flag so the folded edit never double-records via
  the mirror. The surgery updates (`truncateBlockTextFrom`,
  `appendRunsAtJoin`) pass `discrete: true` so the binding's Yjs transaction
  lands synchronously inside the capture window — and `split` defers its
  capture one microtask because it is called from a Lexical command handler
  (inside the editor's own update; a nested update is queued past the
  window). Merge additionally pins the restored source row's `data.text` to
  the LIVE merging runs (`undoTextOverride`): the source doc was FK-cascaded
  with the row, so undo re-seeds it from that row — which must be exactly
  what was un-appended from the target, not a projection-lagged snapshot.
  The unmounted-target merge records doc-level thunks instead
  (`truncateBlockDocFrom` at the returned join offset / re-append).
- **Known degradations (consistent no-ops, never divergence):** redoing a
  text entry for a block whose creation was itself undone (doc destroyed +
  recreated → generation guard skips); undoing text in a block whose editor
  unmounted (collapsed ancestor) — the manager died with the doc. Both leave
  docs ≡ rows. Also: a typing run within 500 ms after a non-doc structural op
  on the same block merges into the pre-op manager item (coarse grouping,
  still consistent).
- The stuck-inverse-overlay hazard this exposed (undo patch → redo patch
  before the undo's confirming push arrives → the undo op could never
  confirm and replayed forever) is fixed in the `optimistic-mutation`
  primitive itself — SAME-TARGET cascade confirmation in `confirmPass` (see
  that plugin's CLAUDE.md). The editor declares op identity via
  `sameOverlayTarget` (block-id-set intersection), so the inverse pair
  cascades while an unrelated block's confirmation can never drop another
  block's still-pending op (e.g. a `projectText` projection patch). Under
  the never-revert policy
  (`research/2026-07-11-global-never-revert-optimistic-edits.md`) the old
  miss-limit eviction is gone entirely: a pending structural op is never
  visually reverted. The `op` and `patch` endpoints return their commit
  watermark (`currentTxId` read inside the write transaction), so an op
  leaves the overlay only for a causal reason — confirmed by content,
  cascaded, or dropped as superseded when a snapshot provably past its
  commit still lacks its effect (rendering newer truth, not a revert). An op
  that fails to converge stays rendered and files a `stalled` divergence
  report instead of un-splitting the user's block; mutate failures surface
  through the sync-status cloud (offline = `syncing` + auto-retry, durable
  HTTP rejection = `error` + Retry), never a rollback.

**Hardening (validated: offline/reconnect, multi-tab, agent concurrency,
history restore):**

- **Doc-init FK gate.** A freshly created / split block mounts its editor from
  the optimistic overlay BEFORE the structural op's POST creates its `_blocks`
  row — a doc-init fired then would FK-violate (500) and the provider's
  `initStarted` latch would wedge the block editable-but-never-synced.
  Seeding is now gated on the block id appearing in **authoritative** blocks
  data: `useOptimisticResource` exposes `serverData` (the raw overlay base),
  the context derives `serverIds` from it, and `CollabTextPlugin` passes
  `rowConfirmed` into `useCollabBlockDoc`, which unlatches the provider
  (`markBlockRowConfirmed`, one-way) — push-based: the same blocks push that
  commits the row lifts the gate. Local edits made in the gap buffer in the
  doc and flush right after the seed. The latch can no longer wedge: any
  `initDoc` failure re-arms `initStarted` (a doc-init 404 — block deleted;
  the server maps the FK violation to a clean 404 — is a deliberate quiet
  TERMINAL stop: the provider latches `blockGone`, drops its buffered bytes,
  and becomes finalizable for the deferred destroy).
- **Instant deterministic pre-seed (synchronous hydration).** The gate
  alone left a freshly-minted block's editor EMPTY until confirm-push +
  doc-init — typing/Enter in that window merged badly with the later seed
  (duplicated paragraphs, keystrokes eaten by the origin truncation). Fixed
  structurally: seeds are DETERMINISTIC — `runsToXmlText` accepts a fixed
  Yjs `clientID`, derived by content-hashing the runs JSON (FNV-1a in
  `use-collab-block-doc.ts`) — so identical runs yield byte-identical seed
  encodings. For an UNCONFIRMED block (no row ⇒ no stored doc can exist, by
  FK) the provider pre-applies the seed locally at `connect()`: the editor
  hydrates synchronously, and the eventual authoritative state
  (its own doc-init echo, or a racing tab's byte-identical seed) merges as a
  no-op. Different runs get different clientIDs, so a mismatched seed can
  only duplicate (plain CRDT merge), never corrupt by item-id collision. The
  seed bytes are built ONCE per provider and reused for pre-apply + every
  doc-init attempt (a retry must never post different bytes than what was
  pre-applied). The pre-seed DISCRIMINATOR is the provider's
  construction-time `blockRowConfirmed` (the consumer's render-time
  `rowConfirmed`, threaded through `acquireCollabDoc`) — an existing block is
  confirmed from its very first render, so it can never pre-seed over its
  stored doc (which would merge the `data.text`-derived encoding into the
  stored one as DUPLICATED text on reopen), regardless of how
  `CollaborationPlugin` orders `connect()` relative to the hook's effects.
  Residual known edge: a keystroke landing < ~20ms after Enter
  (beyond human input; see `e2e/split-typing-window-probe.mjs`) can still be
  dropped.
- **Split focus/caret under pre-seed.** Two follow-on fixes: the origin's
  deferred truncation is background surgery on the block the user is LEAVING
  — it now carries `SKIP_DOM_SELECTION_TAG` so reconciling its cut-point
  selection can't yank DOM focus back from the new block; and
  `focusHydratingAware`'s non-empty path focuses with
  `defaultSelection: "rootStart"` (a pre-seeded fresh editor has no prior
  selection, and Lexical's default is rootEnd — wrong for a split).
- **Offline / reconnect.** Network-level seed/flush failures (fetch rejects,
  no HTTP status) are an expected local-first state: bytes stay queued
  (`pendingUpdates` re-queued at the head) and are retried push-based — on
  the live-state worktree socket's reopen (ws-status bus subscription in the
  provider), on the browser's `online` event (an idle WS may not surface a
  close promptly), on the next server push (`onServerState`), or on the next
  local edit. Never a retry timer. Unexpected HTTP errors still throw loudly.
  TEARDOWN is loss-safe too: the registry's deferred destroy only finalizes
  when the provider is `readyForTeardown` (queue drained, or block
  server-confirmed gone) — an ordinary unmount coinciding with a transient
  outage RETAINS the entry (the provider's reconnect listeners stay live),
  drains the queue on the next reconnect edge, then finalizes push-based via
  the provider's teardown-ready signal. Known edge: closing the TAB while
  offline can lose the last unflushed edits (nothing to retry from) — the
  same class as an unflushed autosave.
- **Update-only projection (restore/delete race).** The `data.text`
  projection dispatches `updateOnly` patches (`BlockPatch.updateOnly`): an
  upsert whose row no longer exists is skipped on BOTH the client overlay and
  the server writer, and `isPatchReflected` treats it as vacuously absorbed
  so the op confirms instead of sticking. This closes the interleave where a
  debounced projection flush races a history restore (or another tab's
  delete) and would otherwise blind-upsert (resurrect) the deleted row with
  pre-delete text.
- **History restore.** `replacePageContent` mints fresh block ids, so a
  restore is automatically doc-consistent: the wipe FK-cascades
  every old `page_block_docs` row, old editors unmount on the push (pending
  doc flushes 409 → the doc-init probe 404s → quiet terminal drop;
  projections are update-only), and the restored rows
  seed fresh content docs from the restored `data.text` on mount. See the
  invariant note on `replacePageContent` before ever preserving ids there.
- **Dormant positional-truncation hazard (offscreen-merge undo).** The
  offscreen-target merge's undo thunk (`truncateBlockDocFrom`) truncates the
  target doc POSITIONALLY — from the join offset to the doc end. Under a FUTURE
  virtualized + multi-writer target (my-devices + agents editing one block), a
  concurrent append past that offset lands in the truncated span and would be
  lost. Dormant today: the page editor doesn't virtualize, so the offscreen
  path never runs against a live second writer, and single-client LIFO undo
  holds. A correct fix is CRDT-relative (delete-set over the appended items, not
  an offset range) and is deferred until virtualization actually exists.

## In-memory mode (`persist={false}`)

`<BlockEditor persist={false} initialContent={…} enabledBlockTypes={…}>` is a
self-contained, non-persisting editor: no `pageId`, no server rows, no network.
It powers throwaway surfaces (the public-site editor demo, drafts, previews,
tests). The whole document lives in React state and is discarded on unmount.

- **One persistence seam (`web/block-store.ts`).** `BlockEditorProvider` reads
  and writes ALL structure through a `BlockStore` (`data`/`serverData`/`pending`
  + `dispatch`/`move`/`bulk*`/`paste`); everything else in the
  provider (recording/undo, focus, `makeBlockAPI`, the CRDT projection) is
  storage-agnostic. `useServerBlockStore(pageId)` is the persistent path (the
  `useOptimisticResource` overlay + the five direct write endpoints);
  `useMemoryBlockStore({ pageId, initialBlocks })` is an authoritative,
  synchronous `useState<Block[]>` that reuses the SAME pure reducers/forest
  helpers (`applyOverlayOp`, `applyBlockOp`, `core/block-forest`'s
  `rankWindow`/`serializeSubtree`/`planForestInsert`) — so op/patch/insert
  semantics are byte-identical to the server. In memory, `serverData === data`
  (every row is authoritative from the start, so the doc-init FK gate is inert).
- **The store owns rank authority.** `move` takes positional intent
  (`zone`/`targetId`) plus the provider's `computeDrop` rank PREDICTION
  (`BlockMoveDest`). The server store ships only the intent — no caller may hand
  the server a rank, because `page_blocks`' single `(parent_id, rank)` ordering
  space is projected disjointly by several live resources. The memory store has
  no such split (one synthetic page, and it holds the forest whole), so the
  prediction IS its authoritative key and it applies it directly.
- **Local-only content docs.** The context flag `serverSync` (true persistent,
  false in-memory) is the ONE place the editor knows whether content docs sync.
  `CollabTextPlugin` branches on it: the server path uses `useCollabBlockDoc`
  (`blockContentResource` subscription + `LiveStateYjsProvider` +
  `doc-init`/`doc-update`); the in-memory path uses `useLocalCollabBlockDoc`
  with `LocalYjsProvider` (`web/internal/local-yjs-provider.ts`), a purely local
  per-block `Y.Doc` seeded from `data.text` at `connect()` that NEVER networks —
  no subscription (which would also need a `NotificationsProvider` the demo does
  not mount), no doc-init/doc-update. Typing, formatting, split, and merge all
  work locally; the projection + undo-capture observers fire identically, so the
  `doc → data.text` projection writes into the in-memory store and text edits
  still ride the unified undo stack. Both hooks return the same `CollabBlockDoc`
  (`providerFactory` + `saveState` + `retrySave`), so `CollabBinding` reports to
  the sync-status cloud once per block on either transport — the local provider's
  save state is permanently `idle` (nothing to save), which aggregates to silence.
- **Attachments gated.** `allowAttachments` is `serverSync`: image/video/file/…
  blocks need a server to store blobs, so memory mode excludes them from the
  palette (`enabledBlockTypes`) AND skips the file-drop / paste-file paths.
- **`Editor.TurnInto` gated.** A `TurnInto` contribution converts a block into
  something the pure `convertTo` cannot express — a server-backed transition
  (today: into a sub-page, re-partitioning `page_id` across a page boundary).
  The block-actions menu renders that whole zone only when `serverSync`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Block-based document editor component and slot system. Block-based document editor — tables, routes, and live state.
- Web:
  - Slots: `Editor.Block` ← `page.audio`, `page.bookmark`, `page.bulleted-list`, `page.callout`, `page.code-block`, `page.divider`, `page.embed`, `page.file`, `page.heading.heading-1`, `page.heading.heading-2`, `page.heading.heading-3`, `page.image`, `page.math.equation`, `page.numbered-list`, `page.page-link`, `page.quote`, `page.sub-page`, `page.text`, `page.to-do`, `page.toggle`, `page.video`, `Editor.TurnInto` ← `page.turn-into-page`, `Editor.FormatAction` ← `page.formatting.bold`, `page.formatting.code`, `page.formatting.color`, `page.formatting.italic`, `page.formatting.link`, `page.formatting.strikethrough`, `page.formatting.underline`
  - Uses: `infra/endpoints.EndpointError`, `infra/endpoints.fetchEndpoint`, `infra/endpoints.useEndpointMutation`, `primitives/css/badge.Badge`, `primitives/css/center.Center`, `primitives/css/inline.Inline`, `primitives/css/overlay.Overlay`, `primitives/css/pin.Pin`, `primitives/css/row.Row`, `primitives/css/spacing.Inset`, `primitives/css/spacing.insetClass`, `primitives/css/spacing.Stack`, `primitives/css/surface.Surface`, `primitives/css/text.Text`, `primitives/css/ui-kit.Button`, `primitives/css/ui-kit.cn`, `primitives/css/viewport-overlay.ViewportOverlay`, `primitives/icon-button.IconButton`, `primitives/icon-picker.SvgIcon`, `primitives/latest-ref.useEventCallback`, `primitives/latest-ref.useLatestRef`, `primitives/live-state.liveStateSocketKind`, `primitives/live-state.useResource`, `primitives/loading.Loading`, `primitives/multi-select.MultiSelectProvider`, `primitives/multi-select.SelectionBar`, `primitives/multi-select.useMultiSelect`, `primitives/multi-select.useMultiSelectItem`, `primitives/networking.subscribeWsStatus`, `primitives/optimistic-mutation.OpNoLongerApplies`, `primitives/optimistic-mutation.useOptimisticResource`, `primitives/popover.InlinePopover`, `primitives/popover.InlinePopoverProps`, `primitives/scroll-reveal.useRevealOnActive`, `primitives/select-scope.ContentScope`, `primitives/slot-render.defineOrderedDispatchSlot`, `primitives/slot-render.defineRenderSlot`, `primitives/slot-render.OrderedDispatchContribution`, `primitives/sync-status.useReportSync`, `primitives/text-editor/caret-trigger.atWordBoundary`, `primitives/text-editor/caret-trigger.CaretTriggerMenu`, `primitives/text-editor/caret-trigger.useCaretMenu`, `primitives/text-editor/caret-trigger.useCaretQuery`, `primitives/text-editor/caret-trigger.useForcedCaretQuery`, `primitives/undo-redo.useScopedUndoRedo`, `reorder.isNodeData`, `reorder.TopLevelEntry`, `reorder.useReorderedEntries`
  - Exports: Types: `BlockContribution`, `BlockEditorAPI`, `BlockEditorHandle`, `BlockPasteHandler`, `BlockRendererProps`, `BlockSection`, `BlockTextExtension`, `BlockTextPluginProps`, `CaretSurface`, `CaretSurfaceRef`, `FormatToolbarValue`, `MarkButtonProps`, `PageIconProps`, `PageOption`, `PageOptionsResult`; Values: `BLOCK_INDENT`, `BLOCK_INSET`, `BlockEditor`, `BlockTextEditor`, `BlockTextRenderer`, `BlockTypeList`, `colorCssValue`, `Editor`, `filterBlockTypes`, `flattenSections`, `getBlockTextExtensions`, `isValidLinkUrl`, `MarkButton`, `MARKER_GUTTER`, `normalizeLinkUrl`, `OPEN_LINK_POPOVER_COMMAND`, `PageContentColumn`, `PageIcon`, `PageOptionsList`, `registerBlockPasteHandler`, `registerBlockTextExtension`, `useBlockEditor`, `useFormatToolbar`, `useGroupedInsertableBlocks`, `useInsertableBlocks`, `usePageOptions`
- Server:
  - Contributes: `resource.declare` "pages", `resource.declare` "page-blocks", `page.block-data` "page"
  - Uses: `database.currentTxId`, `database.db`, `infra/endpoints.HttpError`, `infra/endpoints.implement`, `infra/events.defineTriggerEvent`, `infra/trash._trashEntries`, `infra/trash.defineTrashSource`, `infra/trash.recordTrashEntry`, `primitives/rank.nextRankUnder`, `primitives/rank.rankAfterSibling`
  - DB schema: `plugins/page/plugins/editor/server/internal/tables-events.ts`, `plugins/page/plugins/editor/server/internal/tables.ts`
  - Exports: Types: `Block`, `BlockDeleteHook`, `BlockRestoreHook`, `BlocksChangedPayload`, `BlockTrashHook`, `PageContentSnapshot`, `PageData`, `StoredBlock`; Values: `_blocks`, `BlockLifecycle`, `blocksChanged`, `BlockSchema`, `blocksLiveResource`, `deleteBlocksSubtree`, `Editor`, `PAGE_BLOCK_TYPE`, `pageData`, `PageDataSchema`, `pagesLiveResource`, `replacePageContent`, `serializePageContent`
  - Register: `defineTriggerEvent('page.blocksChanged')`, `defineTrashSource('pages')`
  - Routes: `GET /api/pages`, `GET /api/pages/:pageId/blocks`, `POST /api/blocks`, `PATCH /api/blocks/:id`, `DELETE /api/blocks/:id`, `POST /api/blocks/:id/move`, `POST /api/blocks/:id/turn-into-page`, `POST /api/pages/:pageId/blocks/op`, `POST /api/pages/:pageId/blocks/patch`, `POST /api/pages/:pageId/blocks/bulk-delete`, `POST /api/pages/:pageId/blocks/bulk-move`, `POST /api/pages/:pageId/blocks/bulk-duplicate`, `POST /api/pages/:pageId/blocks/paste`
- Core:
  - Uses: `infra/endpoints.defineEndpoint`, `infra/trash.TrashOutcomeSchema`, `primitives/collab-doc.readYDoc`, `primitives/collab-doc.yDocContent`, `primitives/collab-doc.yDocFromLexical`, `primitives/live-state.resourceDescriptor`, `primitives/rank.Rank`, `primitives/rank.RankSchema`, `primitives/tree.isDescendant`, `primitives/tree.selectionRoots`, `primitives/tree.subtreeIds`
  - Exports: Types: `Block`, `BlockData`, `BlockDiff`, `BlockHandle`, `BlockMarkdown`, `BlockNode`, `BlockOp`, `BlockPatch`, `BlockTextVariant`, `BulkDeleteBlocksBody`, `BulkDuplicateBlocksBody`, `BulkMoveBlocksBody`, `ColorToken`, `CreateBlockBody`, `Mark`, `MdParseCtx`, `MdSerializeCtx`, `MoveBlockBody`, `PageCover`, `PageData`, `PageRow`, `PasteBlocksBody`, `RichText`, `RunsTokenExtension`, `RunsXmlTextOptions`, `SerializedBlock`, `TextBearingSchema`, `TextData`, `TextRun`, `TurnIntoPageBody`, `UpdateBlockBody`; Values: `applyBlockOp`, `applyBlockOpEndpoint`, `BlockOpSchema`, `BlockPatchSchema`, `BlockSchema`, `blocksResource`, `bulkDeleteBlocks`, `BulkDeleteBlocksBodySchema`, `bulkDuplicateBlocks`, `BulkDuplicateBlocksBodySchema`, `bulkMoveBlocks`, `BulkMoveBlocksBodySchema`, `canIndent`, `canOutdent`, `childrenOf`, `coalesce`, `COLOR_TOKENS`, `colorCssValue`, `createBlock`, `CreateBlockBodySchema`, `defaultTextHandle`, `defineBlock`, `deleteBlock`, `diffBlocks`, `isEmptyPatch`, `listBlocks`, `listPages`, `MARK_ORDER`, `mergeRuns`, `moveBlock`, `MoveBlockBodySchema`, `nextVisibleLine`, `opBlockIds`, `PAGE_BLOCK_TYPE`, `pageBlockHandle`, `PageCoverSchema`, `pageData`, `PageDataSchema`, `PageRowSchema`, `PAGES_TRASH_SOURCE`, `pagesResource`, `parseMarkdownToForest`, `pasteAnchorId`, `pasteBlocks`, `PasteBlocksBodySchema`, `patchBlocks`, `patchesFromDiff`, `plainOf`, `planForestInsert`, `prevVisibleLine`, `rankWindow`, `RichTextSchema`, `runsLength`, `runsOf`, `runsOfNode`, `runsToLexical`, `runsToXmlText`, `serializeBlockRuns`, `SerializedBlockSchema`, `serializeForestToMarkdown`, `serializeSubtree`, `sortMarks`, `splitRuns`, `SvgNodeSchema`, `textBlockSchema`, `textDataSchema`, `textOf`, `TextRunSchema`, `tokenOf`, `turnIntoPage`, `TurnIntoPageBodySchema`, `updateBlock`, `UpdateBlockBodySchema`, `withRuns`, `xmlTextToRuns`
- Cross-plugin:
  - Imported by: `apps/pages/content-search`, `apps/pages/history`, `apps/pages/page-tree`, `apps/pages/starred`, `apps/pages/welcome/recent-pages`, `apps/story/marker`, `apps/story/shell`, `apps/story/story-core`, `apps/website/demos/editor-toy`, `page/attachment-block`, `page/audio`, `page/bookmark`, `page/bulleted-list`, `page/callout`, `page/code-block`, `page/divider`, `page/editor-collab`, `page/embed`, `page/file`, `page/formatting/bold`, `page/formatting/code`, `page/formatting/color`, `page/formatting/italic`, `page/formatting/link`, `page/formatting/strikethrough`, `page/formatting/underline`, `page/heading/heading-1`, `page/heading/heading-2`, `page/heading/heading-3`, `page/image`, `page/inline-date`, `page/inline-page-link`, `page/links`, `page/math/equation`, `page/math/inline`, `page/numbered-list`, `page/page-link`, `page/quote`, `page/read-only-view`, `page/sub-page`, `page/text`, `page/to-do`, `page/toggle`, `page/turn-into-page`, `page/url-paste`, `page/video`
  - Extended by: `apps/pages/starred` (table `page_blocks_ext_starred`), `apps/story/marker` (table `page_blocks_ext_story`)
  - Endpoint callers: `editor-collab`

<!-- AUTOGENERATED:END -->
