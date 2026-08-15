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
column free. `BlockRow` takes the resolved seat as a prop and still computes no
geometry itself — `block-editor.tsx` derives it from the `frameSpans` it already
has (`internal/rail-seat.ts`).

**The span rule is not the ownership rule** — that pair is stated once, in
`internal/rail-seat.ts`, because conflating them was the bug that motivated the
`RailSeat` abstraction. `left` is a SPAN rule: *every* row inside a frame seats at
the frame's edge, the borrowed first line and lines 2..n alike. `owner` — which
block the rail's controls act on — is a BORROW-CHAIN rule: only the borrowed
*line* transfers ownership, so lines 2..n own themselves.

**Hosts never compute the edge.** `BLOCK_GUTTER` is deliberately *not* exported from
the web barrel — a host that re-adds it to its own wrapper's padding drifts the title
off the block text's edge. Instead: editable page surface → `<PageContentColumn>`
(rail + inset); read-only surfaces → `<Inset x={BLOCK_INSET}>` with
`<ReadOnlyBlocks>` flush at `C`; a new block type → `<Inset x={BLOCK_INSET} y="…">`
(vertical padding is *not* part of `BLOCK_INSET` — it differs per block).

Never splice a ramp step into a class name (`` `pl-${BLOCK_INSET}` ``): Tailwind emits
an `@utility` only for literal tokens it can scan. Use `<Inset>`, or `insetClass()`
from the spacing primitive when you only have a `className`.

One known deviation from the invariant: the code background sits at
`C + BLOCK_INSET` rather than bleeding to `C` (its `px` wrapper is outside the
decoration). The callout tint and the quote's left rule were two more until each
became a container frame — a frame gets `C` handed to it as `inset`, so both now
bleed correctly.

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
(never per keystroke), and the block's content owner outlives the remount (one
deferred session end — see *One owner per block*) so text survives;
`e2e/indent-caret-verify.ts` is the caret spec.

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
- **It borrows its first child's line** — for the gutter seat, and for the fold
  (see *A container folds to its borrowed line* below). It declares no
  `collapsible` and its stored `expanded` is live. This used to be
  `collapsible: "never"` with the flag made *inert*, because an anchor had no
  chevron to reopen itself with; folding to the borrowed line means a collapsed
  container always paints a line and that line always carries the chevron, so
  the flag is safe to mean what it says.
- **The decoration lives in the row layer, never the frame.** Frames are emitted
  before the rows and are `pointer-events-none`, so an interactive control there
  is hit-tested under the following row. The anchor component rides on the
  `Editor.BlockFrame` contribution (`BlockFrameMeta.anchor`) precisely so it
  cannot drift from who actually paints a box, but the *surface* mounts it — in
  the `BLOCK_INDENT` column at `C`, seated on the first visible child's borrowed
  first-line centre, since an anchor has no line of its own to measure.
- **An anchor row renders no rail *of its own* — because the rail on its borrowed
  line is already the container's.** The slots coincide with the first child's, on
  the same visual line, so there is exactly one rail there and `RailSeat.owner`
  resolves it to the outermost borrowing container: `+`, drag and the actions menu
  act on the container, not on the child. A second rail here would also register a
  second dnd-kit draggable under the same `drag:<id>`. The decoration is appearance
  and its own click surface, nothing structural.

### The rail's menu dispatches by owner

`BlockActionsMenu` is the ONE rail popover and has two arms, chosen by a **core**
fact about the seat's owner — `BlockHandle.anchor`, never by whether a plugin
contributed sections:

- ordinary owner → *Turn into* (+ `Editor.TurnInto` contributions) + *Delete*;
- **container** owner → its `BlockFrameMeta.menu` sections, then *Collapse/Expand*
  (`RailSeat.owner.childCount > 1`), *Remove `<label>`* (`unwrapBlock`), *Delete*.
  No *Turn into*: a void container owns no text, so converting it away has nowhere
  to put its children.

Both structural halves are **generic**: `Remove callout` derives its wording from
`handle.label`, so a new container type wires nothing here. `menu` is a second
field on the same `Editor.BlockFrame` registration as `anchor` (`useBlockFrameMenus`
is `useBlockAnchors`' twin), reusing `Editor.TurnInto`'s contribution prop shape so
"menu sections contributed by a plugin" is one convention. A container's appearance
renders in **both** the glyph's popover and this menu, deliberately — the rail is
where a user looks for block actions, the glyph is where they look for the glyph.

`BlockHandle.anchor` is a **core** fact because the reducer needs it (`BlockOpContext.anchorTypes`
drives the split/merge refusals and the childless-anchor prune) and the server has
no slots; the *component* is a web contribution. `page-editor:anchor-has-decoration`
fails a handle that declares one without the other.

Escaping the box is `unwrap` (`core/block-ops.ts`): Backspace at the start of an
anchor's first child dissolves the container and promotes its children into its
slot. The generic `isIndented` → outdent rung would instead pop that child out
*and adopt the remaining siblings as its children*, silently re-nesting content
nobody asked to nest.

### A container folds to its borrowed line

> A collapsed container renders exactly its first visible LINE and nothing else.

`visibleChildRule` (`core/block-ops.ts`) is the one statement of it, in two
rules — **R1**: an anchor always descends into its first child, collapsed or not
(its own line IS that child's); **R2**: the borrowed line of a collapsed anchor
shows no children and no following siblings. So folding a container is the same
rule every ordinary block follows ("hide everything below my own line"), and
nothing on screen moves when it folds.

The consequence that retired `collapsible: "never"`: **a collapsed container
always paints one line**, so content can never hide behind nothing — whatever a
hand-written `PATCH` or a pasted `SerializedBlock` sets `expanded` to.

- **Two encodings, one rule.** `visibleChildRule` returns the answer only;
  `visibleChildrenOf` resolves it over the flat array (reducer, ladders) and
  `flattenVisible` over the already-built tree (surface, so a render costs no
  per-node `childrenOf` scan). `flatten-blocks.test.ts` cross-checks them over a
  fuzz forest — a drift is the editor showing lines the ladders think are hidden.
- **The chevron rides on the borrowed line's ROW, and targets the container**
  (`resolveRailSeats`). It cannot live in the anchor's own row: gutter controls
  are `pointer-events-none` until their row is hovered and an anchor row is
  zero-height, so nothing could ever reveal it — collapse would be unreachable
  while expanded. There is exactly one slot on that line (the span rule seats a
  container and its subtree at one `left`), and it is the ONE rail control not
  unconditionally the seat's `owner`, allocated: a *collapsed*
  container claims it (the way back out, and the row's own state would lie);
  else the line's own block if it needs one — load-bearing for
  `collapsible: "always"` types, where the chevron drives the page MOUNT, not a
  fold; else an expanded container with 2+ children. Nested containers share one
  borrowed line, so only the outermost claims it; the rest fold from the rail
  popover's own Collapse item.
- **Content lands where it can be seen.** `applySplit` opens the containers it
  writes into (`revealAround`) — it was the one op that did not, and the tail
  landed among the folded children with no row and no Lexical instance while the
  executor had already truncated the origin's doc, so the text after the caret
  vanished. `applyInsert`/`applyPaste`/`applyMove` already opened their
  destination parent, as do both server move handlers.
- **You cannot restructure what you cannot see.** On a collapsed container's
  borrowed line, Backspace-at-start and Shift+Tab resolve to `{type:"expand"}`
  instead of `unwrap`/`outdent` — both would otherwise act on the hidden lines
  (spilling them into the document, or adopting them as the escaping block's
  children). One structural level per press, as empty-Enter's ladder already does.
- **A block is born expanded.** Every creation path mints `expanded: true`
  (unobservable — new blocks are childless), so a collapsed row is provably the
  user's own act. Hygiene, not the safety mechanism: the guarantee is the line
  a collapsed container always paints.
- **Read-only surfaces ignore the fold** (`read-only-view` never reads
  `expanded`), as do markdown, copy/paste and search indexing. Collapse is
  editing-surface view state — so the editor and the version-history *diff*
  deliberately disagree about what the document shows.

## A block id has one mint (`newBlockId`)

`core/block-id.ts` mints every `page_blocks` id, as `block-<uuid>` — the client
before the round trip (`insert`/`split`'s `newId`, `wrapInContainer`,
`withMintedIds`), the server for a row no editor is open on (`createBlock`,
turn-into-page's seed child). `page-editor/no-adhoc-block-id` keeps it one mint.

**An id is opaque everywhere except the mint** — never validated, never
destructured. Rows predating `newBlockId()` keep bare-uuid ids (a backfill is a
migration: two self-FKs plus every `page_blocks_ext_*` table reference them), and
**undo of a delete re-inserts a row under its ORIGINAL id**, so a legacy-shaped
id reaches an INSERT on a live path.

## A page's structural writes are one ordered stream over one locked forest

Two invariants, deliberately not conflated. **A is per-page and server-side; B is
per-writer and client-side.** Between two *different* writers (a second tab, an
MCP writer) no causal order exists, so B has nothing to preserve there — A is the
complete and correct answer, and that is a design fact, not a residual gap.
Design: [`research/2026-08-01-page-structural-write-contract.md`](../../../../research/2026-08-01-page-structural-write-contract.md).

### A — atomicity (server)

> A structural write to a page's forest reads and writes it inside ONE
> transaction holding that page's lock. There is no way to write `page_blocks`
> without one.

`withPageForest(scopes, fn)` (`server/internal/page-forest.ts`) is the only
producer of a `PageForestTx`, and every export of
`server/internal/forest-writer.ts` — the only module allowed to mutate
`_blocks` — requires one. So an unlocked write is a **tsc error**, and importing
`_blocks` to route around the helpers is a **lint error**
(`page-editor/no-adhoc-forest-write`). Two halves; neither is sufficient.

- **`ctx.forest()` is the only read**, and it is lazy — which is what makes "the
  read happened under the lock" true by construction, and lets a delete/purge
  spanning many pages pay for no forest it never reads.
- **Locks are taken in sorted key order** over a deduped set as the transaction's
  first statements. That is the deadlock proof for multi-page writers (a
  cross-page move, a subtree delete spanning sub-pages), not a style choice.
- **A scope is `string | null`**; `null` is the workspace root, a real sibling
  space with its own live unique index, so it cannot be a hole callers fall
  through.
- **`ctx.afterCommit(cb)`** is where notify fan-out, reindex and re-push go —
  never inside, which would stretch the lock and await the pool from inside a
  transaction (`database/no-pool-await-in-transaction`).
- **Rank parking is unconditional** in `writeForestTarget`, not per-op: any diff
  that permutes `(parent_id, rank)` among siblings transiently duplicates a pair
  mid-loop, and the index is per-tuple and not deferrable. `pairChanged` filters
  it, so ops that permute nothing pay nothing.
- `BlockLifecycle.OnDelete(rows, tx)` fires from the writer, inside the lock, on
  exactly the branch that really hard-deletes. `rows` is authoritative, so a hook
  answers "which of these were pages" with `row.type` — no DB round-trip, nothing
  predicted. Anything else it needs pre-delete it reads on `tx`.

### B — order (client)

> One writer's structural mutations reach the server in the order it issued them.

Not a page-editor property: `optimistic-mutation`'s model is
`data = pendingOps.reduce(apply, serverTruth)`, an **ordered fold**, so ops that
don't commute need the server to apply them in issue order or truth diverges from
the prediction forever. Ordering therefore lives in that primitive's per
`(resource, params)` **send lane**, not in a ref here (a per-consumer chain
ordered each mount against itself only). See its CLAUDE.md.

The editor's whole job is to have **one way onto that lane**: every structural
mutation is a `BlockOp` (or the undo/redo `BlockPatch`) dispatched through
`BlockStore.dispatch`, so `web/block-store.ts` and the composite router are the
only callers of `applyBlockOpEndpoint` / `patchBlocks` —
`page-editor/no-adhoc-structural-write` makes a third one a build failure. The
two writes with no overlay to carry them (the detached persist into a collapsed
sub-page, and a cross-page drag) use `enqueueResourceWrite`, which is the same
lane without a prediction.

## The caret authority (input follows the model, not the DOM)

> The editor holds ONE authoritative caret location. It moves synchronously with
> the keystroke that moves it. DOM focus is a PROJECTION of it — never the source
> of truth, never consulted to decide where input goes.

`internal/caret-authority.ts` owns that location AND the `BlockFocusHandle`
registry. **The registry is deliberately unreachable from the provider**: there
is no way to focus a block except `land()`, so the gap below cannot be
reintroduced by a future caller. (`surgeryOf()` hands back only
`BlockTextSurgery` — no `focus` — for split/merge content edits.)

The gap: a block created by Enter does not exist yet, so the caret used to land
only when its editor's **passive** effect registered a handle — a separate React
scheduler task — while keydowns arrive from the browser's higher-priority
user-interaction source. Every keystroke in between went to the ORIGIN, already
truncated, caret at the cut point: "alpha" Enter "bravo" → `["alphab","ravo"]`.
Nothing bounded that window; human typing speed just usually won the race.

- **Two states.** *idle* — model and DOM agree, the authority does nothing and the
  browser types natively (which is what keeps IME/dictation/autocorrect working:
  they need a real editing host). *in flight* — the model moved, the DOM hasn't;
  the authority owns the keyboard.
- **The caret parks on the container, it does not defend the origin.** A claim
  does `container.focus()` + `releaseCaret`, so the origin stops being an editing
  host and nothing can enter it BY CONSTRUCTION. `preventDefault` would not be
  airtight — `beforeinput` with `insertCompositionText` is not cancelable.
  Consequence: `beforeinput` never fires during a flight (there is no editing
  host), so buffered text comes off **`keydown`** (`key.length === 1`) plus a
  `paste` capture; `ctrl`/`meta` keydowns pass through untouched.
- **A burst of mutations in one turn needs ordering the old code got for free.**
  Replay issues structural mutations back-to-back with no React commit and no
  pause between them. Two of the three assumptions that broke are now the
  enforced invariants A and B of *One ordered stream over one locked forest*
  below; the third is local here: `rowsRef` is ADVANCED at each mutation
  chokepoint (`advanceRows`), not only by the consumer effect — otherwise two
  mutations in one turn both snapshot the pre-first-mutation rows and the second
  reasserts the first's columns.
- **KNOWN BOUND: composition input started inside the flight window is DROPPED.**
  A dead key or IME keydown carries no character (`key` is `"Dead"`/`"Process"`),
  and with no editing host there is nothing to compose into, so it is neither
  buffered nor replayed. It is the price of the line above and strictly better
  than the alternative — before, those characters composed into the WRONG block —
  but it IS a loss, bounded to the mount gap (typically one commit); IME is
  untouched once the caret has landed, and completely untouched while idle. The
  fix, if it ever matters, is to shorten the window (`flushSync` + a layout-effect
  registration), NOT to make the container an editing host.
- **Landing waits for caret-READY, not for the mount.** A freshly split block's
  Lexical root is childless until the collab pre-seed lands, and there is nothing
  to insert into until then. `CaretLandOptions.onLanded` is that signal;
  `focusHydratingAware` fires it on both branches. A landing policy that takes the
  caret and never reports back leaves the authority holding the keyboard —
  **so a landing RESOLVES, one way or the other**. `onLandingLost` is the failure
  dual (focus moved off the root before content arrived → abort
  `landing-focus-lost`). Neither authority bound covers it: `focusout` only sees
  focus leave the block LIST (a steal onto another block, or onto `<body>` with a
  `null` `relatedTarget`, is invisible), and `reconcile` only counts commits
  rendering no line for a target that IS rendered.
- **Replay must be INDISTINGUISHABLE from typing**, and that is four rules, each
  paid for by a shipped bug (`replayInput` in block-text-editor):
  - **One character per commit** — never coalesce a text run. The block markdown
    shortcut fires on the `"- "` transition and the inline one demands
    exactly-one-char-typed, so a coalesced `insertText` skips every incremental
    transform: `"- Bravo bullet"` stayed a paragraph and the next Enter inherited
    `text`. The Yjs cost coalescing avoided does not exist (the `Y.UndoManager`'s
    500ms `captureTimeout` folds a run into one item either way).
  - **`discrete: true` on every replayed edit** — Lexical's default commit is a
    microtask, so the next entry would resolve against pre-insert state: offset 0,
    empty runs, a split at `position: 0` whose `truncateAt(0)` wipes the doc
    (`["alpha","","charlie"]`).
  - **One microtask yield per entry** — the editor DEFERS work by `queueMicrotask`
    (the markdown conversion, split's doc-edit capture, inline autoformat) and a
    real keystroke sequence lets it run between keys. Replaying a whole buffer
    inside one microtask starves it. Microtasks drain before the next input event,
    so this cannot let the user overtake the buffer.
  - **Unconsumed keys need their DEFAULT ACTION applied** — `dispatchCommand` is
    not a DOM event and a synthetic `KeyboardEvent` is untrusted, so nothing runs
    when no listener consumes it. Lexical's own listeners cover Enter / Backspace /
    Delete, but ordinary caret movement is the BROWSER's: five buffered ArrowLefts
    silently did nothing, so the following Enter split at the end instead of
    mid-word. `selection.modify` replays Left/Right; an unconsumed Up/Down (a move
    between visual lines, which has no model equivalent) is dropped — a caret
    position, never content.

  A replayed Enter re-enters `split()` and claims the NEXT flight, so the "alpha
  Enter bravo" composition needs no special case.
- **Only a block that does not exist yet is claimed.** A block that exists but has
  no mounted handle (a void row, a collapsed-away editor) is queued best-effort
  WITHOUT taking the keyboard: the caret never moved off the origin, and claiming
  for a landing that may never come would strand the user's typing.
- **Failure is a state.** The flight is bounded PUSH-BASED (`reconcile` on every
  commit, never a timer) and by focus leaving the surface. On abort the buffer
  replays into the ORIGIN and one `caretFlightReportSink` report is emitted
  (consumer: `reports/plugins/caret-flight` → Debug → Reports); a handle without
  `replayInput` aborts loudly rather than eating the keystrokes.
  The bound's driving relation is the **RENDERED line set** (`flatOrderRef`) —
  NOT `serverIds` (under never-revert a split's block renders long before any
  push confirms it, so that would abort every normal split), and not merely "the
  row exists" (a row nothing renders — a collapsed ancestor — mounts no editor,
  so the landing can never happen and the keyboard would hang undiagnosed).

**Replay must commit `discrete`, and must not begin inside an update.** Each
replayed insert is committed synchronously (`discrete: true`) because the next
replayed key resolves against `getEditorState()` — Lexical's default microtask
commit would have it read the PRE-insert state, resolve "empty block", and split
with `position: 0, runs: []`, whose `truncateAt(0)` wipes the doc (this shipped
once: `["alpha","","charlie"]`). `discrete` is only honored outside an enclosing
update, and a landing can fire from inside one, so `replayInto` defers the whole
loop one microtask — which cannot let the user overtake the buffer, since
microtasks drain before the next input event.

**Two guardrails, and neither subsumes the other.**
`web/__tests__/caret-authority.test.tsx` is the only place the long window is
deterministic (withhold the target's handle) — it pins routing, ordering, the
flight hand-off and the abort path. It CANNOT model Lexical's commit timing: its
fake handles have no editor state, so the `discrete` defect above passed there
and was caught only by `e2e/split-typing-verify.ts` in a real browser. Anything
about *when* an edit becomes visible to the next one belongs in the e2e. Design:
[`research/2026-07-31-page-caret-authority.md`](../../../../research/2026-07-31-page-caret-authority.md).

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

## Caret geometry is stated in LINE BOXES (`internal/caret-geometry.ts`)

"Is the caret on the first / last **visual** line" (which decides whether an arrow
moves within the block or crosses to the next one) and "place the caret at pixel
column *x*" are both answered by comparing **line boxes** — never the caret's *y*
against the contenteditable's padded box. A block's soft lines are `<br>`-separated
runs inside one `<p>`, and a collapsed `Range` paints **nothing** on an empty soft
line or beside an inline decorator, so anything derived from the root's box is a
guess. Rules that look redundant but are not:

- **Every rect read returns a real box or `null`; `null` degrades to the STRUCTURAL
  edges**, never to `onTopLine/onBottomLine = true` (which would claim the caret is
  on both edges of a multi-line block at once).
- **Unmeasurable positions borrow the box of the child at the anchor offset** — the
  `<br>` forming the empty line, the chip the caret stands before. That child is
  always on the caret's own line.
- **`edgeLineRect` walks leaves INWARD from the edge**, so an unmeasurable trailing
  leaf hands off to the leaf before it. Climbing to the parent instead returns a box
  spanning every line at once. A `<br>` has no client rects but does have a bounding
  box — that fallback is the last line of any block ending in a blank line.
- **A hit-test's `(element, childOffset)` is translated to a Lexical child index**;
  element offset 0 would land every hit on the block's first line. A hit resolving to
  the RootNode, a `LineBreakNode` or a **decorator** lands *beside* it — an
  element-typed point on a decorator is a caret the browser cannot paint.

Spec: `e2e/soft-line-caret-verify.ts`. Crossing a decorator sideways belongs to
`primitives/text-editor/decorator-nav` (mounted by both Lexical hosts), not here.

## A mark boundary is a caret position (the virtual delimiter)

> Every inline-mark boundary holds one INVISIBLE ONE-CHARACTER DELIMITER.
> Rendering is unchanged; only the caret and the edit semantics pretend the
> character is there.

Marks are format **bits on a `TextNode`**, not nodes with edges — so at a
boundary the caret is one point with two meanings (inside the span, outside it)
and the DOM offers one. A block ending in a marked run therefore trapped the
caret: `offset === getTextContentSize()` was the last position that existed, and
plain text could never be typed after it. Not `decorator-nav`'s bug (a position
that exists but isn't painted); a position that does not exist. Design:
[`research/2026-08-06-page-inline-mark-boundary-caret.md`](../../../../research/2026-08-06-page-inline-mark-boundary-caret.md).

> **A boundary has TWO caret states, carrying the LEFT run's marks and the RIGHT
> run's. The browser hands you one of them (`natural`). The stop is THE OTHER
> ONE.**

- **One stop per boundary.** One press crosses the whole boundary; one Backspace
  deletes the whole boundary. `virtualStop()` returns the direction AND the marks
  from one branch, because they are one fact — which of the two states the caret
  is standing in. Do not split them again (see below).
- **A block edge is an empty unmarked neighbour.** That single modelling choice
  is what makes block-start, block-end and mid-block ONE code path — the boundary
  strip (`internal/mark-boundary.ts`) never asks which of the three it is.
- **The stop is a question about the LIVE anchor**, not about the boundary's
  shape. A text/text seam resolves to the END of the left run, so `natural = L`
  and **every** boundary gets a stop — mid-block ones included, one extra press
  each. That left bias is **not Chromium's** (as this file and the design doc
  both used to say): it is `resolveSelectionPointOnBoundary`
  (`lexical@0.44.0 Lexical.dev.mjs:7669-7677`), which rewrites a collapsed point
  at `offset === 0` whose previous sibling is a `TextNode` to that sibling's end,
  on every DOM→model resolution. Same observable, but a deterministic,
  cross-browser, version-pinned **library invariant** rather than a browser quirk
  that could flip — so `e2e/mark-boundary-verify.ts` phase 6a's "the bias has
  flipped" failure message describes something that cannot happen while that
  function exists. (`internal/mark-depth.ts`'s header carries the full citation
  chain; the same function is why depth cannot live in the document at all.) The
  design predicted the opposite (`` `zz`|plain `` would need none, since the
  plain run's own start already carries `{}`) and was wrong; consistent behavior
  everywhere is the trade, taken deliberately. Two things follow. The direction
  needed no change, because it asks the anchor instead of predicting the
  resolution — so a falsified assumption cost one test expectation, not a
  redesign; **keep it derived**. And **mid-block was broken before this feature
  too**: typing at `` `zz`|abc `` used to produce a `{code}`-marked character in
  a run the user is typing outside of.
- **`left ∩ right` is NOT the stop — it is the deletion's residual**, and this is
  the trap to not "fix" back. `L ∩ R` coincides with the real answer whenever the
  stop's side is a SUBSET of `natural`'s (every block edge, and the measured
  `` `zz`|plain `` seam), so it looks right and tests green. It fails silently at
  `` a|`zz` ``, where it computes `{}`, sees `natural` already carrying `{}`, and
  synthesizes NO stop: you can append to a code span but never prepend into one.
  `L ∩ R` is `delimiterDeletion().residual` — what both runs keep once the
  delimiter is deleted, hence the caret's marks afterwards.
- **The delimiter's deletion is split by SIDE** (`before` = `L \ R`, `after` =
  `R \ L`), walked outward from the seam's two leaves. A mark lives on exactly
  ONE side, so a single-direction walk from the anchor no-ops on the other's —
  at `` a|`zz` `` that is a Backspace consumed for no effect.
- **A block's own edge is a boundary too, and a horizontal CROSSING must meet the
  state facing the side it came from** — `markArriveFor`'s rule, one scope up.
  Which arrivals obey it is not a list anything here maintains; see *Every
  arrival is an announced crossing*.
- **Virtual positions, never real zero-width nodes** — but **not for the CRDT
  reason once written here, which is false**. ("Two peers at one boundary give
  two seams `coalesce` won't merge": `Item.integrate` ORDERS concurrent inserts
  rather than merging them, so two seams do appear — but a dedup rule stated over
  CONVERGED state is a pure function of the merged document, both peers compute
  the same answer, and Yjs deletes are idempotent tombstones. It converges in one
  round. Don't repeat it.)

  What actually rejects a real seam: (a) a caret-addressable character is a real
  character in the browser's text layer, so find-in-page stops matching across
  it, spellcheck and double-click word selection segment on it, and single-line
  `Cmd+C` is *deliberately* handed to the browser (`internal/clipboard.ts`,
  `decidePaste`'s `{kind:"default"}` arm) so it reaches the system clipboard with
  no code of ours in the path; and (b) it is a character in the plain-text offset
  basis, which reaches a SERVER consumer —
  `page/markdown-apply/server/internal/runs-splice.ts` splices a block's `Y.Doc`
  from seam-free runs, so every agent write would delete every seam and every
  client re-mint them. A Lexical-only seam excluded from the Y doc is not
  available either: `CollabElementNode.syncChildrenFromYjs`
  (`@lexical/yjs@0.44.0 LexicalYjs.dev.mjs:529-540`) unconditionally
  `removeFromParent`s every Lexical child with no collab twin on every remote
  sync, and `SKIP_COLLAB_TAG` is exported by `lexical` but never read by
  `@lexical/yjs`.

### Every arrival is an announced crossing

> Every mover that relocates a caret **across** something announces the crossing
> on one channel, in the direction of travel. Every consumer of a virtual
> position observes that channel. **A crossing is declared by the mover that
> knows it happened — never inferred from a selection transition.**

The channel is `primitives/text-editor/caret-motion`; this editor's observer is
`internal/mark-arrival.ts`, mounted beside the depth store in
`keyboard-plugin.tsx` (both halves of the caret's second component in one place).
It is a Lexical command, not a registry, because a listener runs INLINE inside
the announcer's own update — so the observer reads the pending selection the
crossing just produced, which is what an arrival needs and what the observer used
to buy, back when it had one caller, with an `editor.update()` of its own.

Adding a virtual-position kind is one observer; adding a mover is one call. The
matrix collapses from `movers × kinds` to `movers + kinds`. Only the direction
travels — `markArrive` carries `dir`, never a mark set — so "which state does an
arrival land on" has exactly ONE implementation, reading the live anchor after
the placement. The three movers today: the step within a block (`markArrive`),
the cross-block landing (`CaretLandOptions.crossing`, the surface-level spelling
of the same announcement, because a `CaretSurface` has no Lexical editor), and
the step across an inline decorator. Nothing else announces, so a click, a focus
restore, a vertical crossing and every explicit placement land `natural`.

**The "never inferred" half is load-bearing.** A transition-derived rule ("did
the anchor cross a boundary?") cannot tell a one-character click from a
one-character arrow step, and `$placeCaretAtLinearOffset`'s merge landing looks
like a unit step too — it would arm the `escaped` gate for all three. `e2e`
phase 10e is the assertion that catches it.

### Depth is STORED, never derived from `selection.format`

The cheapest-looking design — "depth = the caret's format diverges from its
node's" — is **aliased by three shipped mechanisms**, each of which produces that
divergence with no escape step anywhere in the interaction:

1. **`FormatShortcutsPlugin`'s Cmd+E** fires on a collapsed caret by design, and
   Lexical's collapsed branch of `formatText` is a pure selection toggle — so
   Cmd+E at the end of a `` `xxxx` `` run yields `format = N \ {code}`,
   **bit-identical** to depth 1.
2. **`applyInlineFormat`** snapshots `preFormat` and restores it onto the
   post-transform caret, so **every** successful autoformat lands at `format = 0`
   on a marked node — the single most common path in the editor.
3. **Programmatic caret landings.** `TextNode.select()` leaves `format`
   untouched, `$placeCaretAtLinearOffset` deliberately resolves a boundary to the
   *end of the earlier leaf*, and `appendRunsAtJoin` focuses a selection-less
   editor at the end of a possibly-bold run.

Under a derived depth, each of those makes the user's next Backspace strip
formatting from a whole span instead of deleting a character — an invisible,
destructive edit on the undo stack. **This is the trap most likely to be
reintroduced**, because the derived version looks like it needs no state at all.

So `internal/mark-depth.ts` stores it: a `WeakMap<LexicalEditor, anchor>`
**written only by the `markStep` executor**, **read with verification** (it counts
only while the live selection is still collapsed at exactly that anchor; anything
else is depth 0), and **cleared on any update with dirty leaves** — its own key is
its invalidation. Lexical's format-divergence carry is a ~200 ms window keyed on
`(anchorKey, offset)`, not durable state, so `selection.format` is the **effect**
(what to type with), re-asserted from the store by a `SELECTION_CHANGE_COMMAND`
listener — never the encoding.

### The `escaped` gate is the safety property

Backspace's new rung sits at the **top** of the ladder, above the `atStart` guard
(the caret is at a run's *end*, so `atStart` is false and today's guard would
passthrough) — and fires **only when `caret.escaped`**, i.e. only after our own
arrow step in the same interaction. Delete gets the symmetric rung above its
`atEnd` guard.

> **The ladder below the new rung is unchanged.** Cmd+E, autoformat and merge
> landings all take the ordinary character deletion, and Backspace-at-start on a
> bold line still merges exactly as today.

`e2e/mark-boundary-verify.ts` is the executable statement: phase 4 is that gate,
one sub-case per aliasing mechanism above, and phase 1 is the feature itself — its
deliberate *settle before typing* is what makes it non-vacuous, since typing
inside Lexical's 200 ms window gives the same rows with no feature at all.

The unmark is a content mutation, so it lives in `inline-format-surgery.ts`
(`removeMarkSpan`) rather than a third near-identical surgery module: that file
already owns the leaf walks, the `hasFormat`-guarded `toggleFormat` idiom that
makes the runs round-trip correct by construction, and the defer-then-re-verify
contract a command listener needs. Wired through `recordDocEdit`, so the
`captureBlockDocEdit` fence gives it its own undo item — **one Cmd+Z restores the
mark and nothing else**.

### `MARK_ORDER` is a storage sort key, NOT a nesting order

Cap-at-1 dissolves the nesting question outright: the caret never stops between
two delimiters, so exit order is **unobservable** and nothing can drift. Do not
reach for one. Had it been observable it would have had to derive from
`wrappersOf` reversed (`core/inline-markdown.ts`) — `code, strikethrough, italic,
bold, underline` — which is deliberately *not* reverse `MARK_ORDER`.

### The one door not taken: marks as inline `ElementNode`s

The only alternative whose core claim survives scrutiny, recorded so the question
stays settled. `resolveSelectionPointOnBoundary`'s inline-`ElementNode` branch is
gated on `!isCollapsed` and so does **not** fire for a caret, while its
`$isTextNode(prevSibling)` branch does — so with marks as elements
`(rightLeaf, 0)` SURVIVES, both boundary states become stable Lexical addresses,
and the arrival problem closes outright (`selection.anchor` says which side you
are on, so `mark-depth.ts` and `mark-arrival.ts` both go). Convergence is solved:
an `ElementNode` maps to a nested `Y.XmlText`, which `LinkNode` proves here in
production.

Rejected because it buys that at the price of two. **There is no pending-mark
channel for elements** — Lexical's only one is `RangeSelection.format`, an
integer bitfield (`Lexical.dev.mjs:6011-6014`), so Cmd+B-then-type, the collapsed
toolbar state and "which side" all need a new side store: it trades the mark
store for a pending-mark store. And **nesting order becomes normative and
observable**, which cap-at-1 deliberately dissolved — with remote applies
committing `skipTransforms: true`, so a normalizing transform would not run for
them. Plus a hard CRDT cutover (every `page_block_docs` blob encodes `__format`).
~2 months. ProseMirror and Slate both keep marks as set-valued properties on text
for the first reason.

### Known bounds

- **The feature is currently invisible.** Nothing reflects a collapsed caret's
  pending marks (`FormatToolbarPlugin` is gated on a non-collapsed selection), so
  depth 0 and depth 1 are pixel-identical and ArrowRight paints nothing. Filed as
  a follow-up, not an oversight.
- **The second component is not restorable.** It lives outside the document, so
  undo, reload and any remote edit lose it — all degrading to depth 0, the safe
  side. There is no address to restore it *to*; see the citations in
  `internal/mark-depth.ts`.
- **`markArriveFor`'s `offset ± 1` is a linear CHARACTER step, not a caret step**
  — wrong for grapheme clusters (a seam right after an emoji or a combining mark
  places the caret mid-surrogate). Pre-existing, covered by no test.
- **`color` and `link` are not delimiters.** `link` needs nothing — Lexical
  already moves a collapsed caret out of an inline parent whose
  `canInsertTextAfter()` is false. `color` is a genuine gap: stepping out of red
  `` `code` `` leaves the caret red.
- **A mark span across a soft line break is genuinely two spans.** `walkNode`
  emits a line break (and a decorator) as an *unmarked run*, so the strip walk
  stops there and the caret model cannot drift from the persisted one. Document
  it; don't "fix" it.
- **The MARK model is page-editor only** — `primitives/text-editor` mounts
  `PlainTextPlugin`, no marks at all — so it does **not** belong beside
  `decorator-nav` in the text-editor primitive. The crossing CHANNEL is the
  opposite: it is a primitive precisely because a mover must announce without
  knowing who observes.

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

## The selection highlight belongs to the RUN, not to the row

> A row paints **no** selection highlight of its own. The highlight is a sibling
> decoration spanning the grid lines of a maximal run of selected visible lines
> — the same shape as a container frame, resolved the same way.

Don't "simplify" it back to a class per row. N selected blocks are ONE region and
the user reads them as one; N boxes restate them as N, and every internal
boundary then draws two rounded corners and two hairlines meeting — a
three-paragraph selection renders as three stacked cards. Those seams are
structural, so they are removed structurally: a run is one element and has no
internal edges to draw.

`internal/selection-bands.ts` resolves the runs, `components/selection-bands.tsx`
paints them, `block-editor.tsx` calls it (like `RailSeat`: "is the line above me
selected too" is unknowable from a row alone). Rounding is a property of the run,
not the row. A run splits into TOUCHING bands wherever the decoration edge steps
(a selected block deeper than the line above it) — a notch in one region, not two
boxes. A selected container paints over its frame span, so `handle.anchor`'s
zero-height row needs no branch. The band spans `C` → the content box's right
edge, the box `ContainerBackdrop` fills, so a selected callout's tint and its
band are concentric.

## The block list is a document, not a listbox

> The block list's container is a **named group of editable blocks**
> (`role="group" aria-label="Page blocks"`). No composite ARIA role is honest
> here, so it claims none.

Every row holds a `contenteditable` editing host. A composite role is a contract
about its children — a `listbox` promises options, a `tree` promises treeitems —
and there is no child role a rich-text editing host can wear. The container used
to say `role="listbox" aria-multiselectable`, which was **worse for a screen
reader than no role at all**: it announced an empty list (nothing below it was an
option), and it flattened the subtree, hiding the headings, lists and quotes that
are the entire point of a page.

- **Do not add `role="option"` to a row.** It is the first fix everyone reaches
  for, and it is the trap: an option's accessible name is its text content, so
  stamping it on a row collapses the editing host into a label and takes the
  editing semantics with it. The lint rule
  `aria-safety/no-orphan-composite-role` fails a re-added `listbox` here; nothing
  mechanical stops the `option` half, so this paragraph is the guard.
- **`aria-selected` is unreachable, not merely unused.** It is supported only on
  `option`, `row`, `gridcell`, `tab`, `treeitem`, `columnheader` and
  `rowheader` — and none of those may host a `contenteditable`. So the state has
  no attribute to live in.
- **Switching roles for the duration of selection is not available either.** It
  would mean `contentEditable={false}` on the rows while selecting, which
  deadlocks the caret authority's landing (see *The caret authority*): the
  authority parks the keyboard on the container and waits for an editing host
  that a role swap has just removed.

Two channels replace the missing attribute, and neither is decoration:

- **The selection is spoken on every range change.** The range moves in exactly
  three places — `applyRange`, the Cmd+A branch, and `clearSelection`, all in
  `internal/use-block-selection.ts` — and each announces through
  `primitives/announce`. `"Heading 2: Container frames, block 3 of 12, selected"`,
  `"…, 4 blocks selected"`, `"All 12 blocks selected"`, `"Selection cleared"`.
  A block is named by the host's `describeBlock` (type label + a short text
  preview), so the hook stays domain-free. Two guards keep it honest: an
  unchanged range is silent (a marquee drag re-applies the same range every
  pointermove), and a clear over an empty selection is silent.
- **A selected row says so, in words.** `BlockRow` renders
  `<span className="sr-only">{isSelected ? "Selected. " : ""}</span>` as its
  constant first child, in both branches. Always mounted, empty when unselected —
  the row's children list must keep a constant length, and `sr-only` is
  `position: absolute`, so it perturbs no rect drag/drop/marquee measures. The
  flag arrives as a prop from the editor (which already recomputes every row on a
  selection change), never as a per-row subscription to the selection store.

**Known bound:** heading blocks still expose no `role="heading"` / `aria-level`.
Now that the listbox no longer flattens the subtree this is the next-largest gap
for a screen reader, but it belongs to the block-type presentation API
(`BlockChrome`), not to the selection surface. A follow-up, not an oversight.

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

The third invariant is what the first two cost every control rendered *inside* the
container:

> **The rail never takes the keyboard.** A gutter control ACTS ON a block, so it
> must not become the focus target that ends block-selection mode.

Neither rule above yields: focus-scoping is what keeps the highlighted selection and
the live keyboard in agreement, since `onKeyDown` answers only to
`e.target === container` — a selection surviving a focus move onto a button would be
highlighted but keyboard-inert. So every control in `block-rail.tsx` goes through
`RailButton`, which suppresses the press's default (the same mousedown +
`preventDefault` idiom `block-row.tsx` uses for Shift+click). Without it, mousedown on
the drag handle cleared the selection before dnd-kit's 4px activation distance was
travelled, and every multi-block drag silently degraded to a single-block `move`.
Nothing downstream wants that default: `PointerSensor` activates off `pointerdown`,
the block-actions popover opens on `click` and refocuses by an explicit `.focus()`,
and Tab still reaches the handle.

Consequence one level up: **dragging a block that is not in the live selection clears
that selection explicitly** (`onDragStart`'s non-bulk arm — Notion's model). It used
to be a side effect of the focus steal, so it now has to be said, or a single-block
drag leaves a stale highlight over blocks the gesture never touched.

### A text drag becomes a block selection at the first boundary

`onPointerDown`'s two entry points (background marquee, text) feed one tracking loop:

> A drag starting inside a block's text belongs to the BROWSER until the pointer
> leaves the origin row; then the editor takes over with a whole-**block** range.

There is nothing to share with the browser: each block is its own contenteditable
**editing host**, and a selection is clamped to the host it started in — dragging out
*collapses* it (pre-change baseline recorded in
`e2e/cross-block-text-selection-verify.ts`: `{collapsed: true, text: ""}`, Cmd+C
copied `""`). Partial cross-block selection was never given up; it never existed.

- **Never intercept the text press on the way down** — no `preventDefault`, no
  `focusContainer()`. Until the pointer leaves the row, native intra-block selection
  IS the feature.
- **Promotion is one-way.** Dragging back leaves the origin selected whole; re-seating
  a partial caret would park one in a blurred block, the exact state `releaseCaret`
  exists to prevent.
- **`select-none` for the rest of the gesture**, not one `releaseCaret`: the pointer is
  still down, so the browser re-seats a range every frame. The class disarms it; the
  per-move `focusContainer()` clears what beat it.

**Holding at either viewport edge scrolls the document and keeps the range growing**
(`useEdgeAutoScroll`, from the scroll-owning `auto-scroll` primitive). Three rules:

- **One applier, two clocks.** `applySelectionAt(clientY)` is the entire per-move
  body, called from `pointermove` **and** from the hook's `onScroll`: with the pointer
  parked at the edge the pointer did not move, the CONTENT did, so re-evaluating only
  on `pointermove` would scroll the document and select nothing new. Mirror rule:
  **`track` is fed from the pointer handler only, never from the applier**, or the
  hook re-latches off its own callback.
- **It engages only once the gesture is already OURS** (`dragMovedRef` /
  `textDragPromotedRef`), never at pointerdown. The trailing `min-h-40` empty zone
  sits exactly inside the bottom edge band on a full page, so engaging on the press
  turns a plain click there into a runaway scroll under a stationary pointer — which
  arms `dragMovedRef` and swallows `onEmptyClick`, i.e. click-to-edit at the bottom of
  a page stops working. Pre-promotion `text` is the same rule: the browser still owns
  the gesture.
- **`dragStartRef` carries two coordinate spaces; do not collapse them.** `x`/`y` are
  VIEWPORT (`onEmptyClick` compares the press against live row rects). `contentY` is
  the press inside `contentRef`'s box, because the marquee is an absolutely-positioned
  CHILD of that box: subtracting a frozen viewport `y` from a content rect re-read
  every frame drifts the anchor by exactly the pixels scrolled since the press, and
  drops them from `height` entirely. The `> 3` drag threshold measures `contentY` too,
  so a stationary pointer over a scrolling surface counts as the drag it is.

`pointerup` and `pointercancel` share one teardown; cancel skips the click branch (a
cancelled press is not a click). Missing the cancel listener used to leak two inert
listeners — now it would leak a scroller with no pointer left to end it.

Already correct, load-bearing only now: the per-move `focusContainer()` survives 60fps
ONLY because it focuses with `preventScroll: true` (`internal/use-block-selection.ts`),
else focus fights the scroll every frame; and `rowAtPointer`'s nearest-row fallback is
what keeps the range extending while the pointer sits below the last block.

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
  through `dispatchOp` + `recordStructural`.)
- **Same optimistic instance.** The `patch` overlay variant flows through the SAME
  `useOptimisticResource` as forward ops, POSTing to
  `POST /api/pages/:pageId/blocks/patch` (`handle-patch-blocks.ts`, a blind
  row-level create/update/delete writer sharing the op handler's delete-lifecycle
  and notify path). Undo/redo thunks dispatch patches DIRECTLY, never through the
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
- **A patch's delete cascade reads POST-patch parentage.** `handlePatchBlocks`
  UPDATEs before it DELETEs, so a row the same patch re-parents out of the deleted
  subtree has already left; `applyPatch` must agree or the overlay drops rows the
  server keeps (redoing an `unwrap` lost every promoted child).

**What is recorded:** all `dispatchOp` ops — which is now every structural
mutation, `paste` / `duplicate` / `move` / `delete` / `bulkMove` included —
plus `convertTo` and non-text `data` edits (to-do `checked`, callout color, image
src… — via `commitRow` with `coalesceKey: blockId`), each with an exact
purely-computed after-state; text edits as mirrored `Y.UndoManager` items. The
editor no longer uses `updateBlock` at all (`handle-update-block.ts` stays for
page-level consumers: page title, sidebar expand, cover).
`web/__tests__/structural-undo.test.tsx` is the per-mutation guardrail, asserting a
QUADRUPLE per mutation: the forward call changed the rows, `canUndo` flipped, undo
restores exactly, redo reproduces. The first is not ceremony — without it a
mutation that silently does nothing passes vacuously, which is how the data-blind
apply-guard hid. **There are no exceptions left to enumerate**: every mutation
reachable from the editor's context is in that table.

**Not recorded, and only these two:** `setExpanded` (pure view state,
`record: false` — Notion doesn't undo collapse/expand; still optimistic, just off
the stack) and `projectText` (Yjs owns text history).

## Drag and block-selection writes are ops too

`move`, `bulkMove` and the bulk `delete` were fire-and-forget POSTs to bespoke
endpoints — no overlay (their eslint-disables read *"drag again to fix"*), no
place in the write order. They are now `BlockOp`s, so DnD is optimistic and the
two bulk endpoints are deleted. What each one had to keep:

- **`move` sends POSITIONAL INTENT, never a rank**: `{ blockId, parentId,
  targetId, zone }`. `page_blocks` has ONE `(parent_id, rank)` space that several
  live resources project disjointly, so a key minted over the rows one writer
  holds collides with the siblings it cannot see. Both sides mint their own from
  `positionalRank` (`core/block-forest.ts`) and the server's stays authoritative
  — the agreement `split` and `paste` already run under.
- **That agreement needs the destination inside the op's own page**, which the
  server enforces with a 400 (`assertDestinationInPage`). A **cross-page** drop
  is not one page's op — the row leaves the source page's resource entirely, so
  no per-page overlay could ever confirm it — and keeps the id-scoped `moveBlock`
  endpoint (which locks both forests), enqueued on the source page's lane.
  `moveBlock` also stays alive for the Pages sidebar, a different surface over
  the `docRank` order.
- **`delete` is a SET** (`blockIds`), like `indent`/`outdent`: one gesture is one
  op, one undo entry, one transaction. A single Backspace-delete is the
  one-element case. It is the only op that may span pages, and the composite
  fans it out per owner (`splitOpByOwnerPage`).
- **`bulkMove`** carries `{ ids, parentId, afterId }` and reduces through
  `planBulkMove`; a refusal is the identity, so a refused drag never reaches the
  undo stack or the network. Cross-page selection drags are refused loudly.

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

- **`insertForest` is the HISTORY-RESTORE path only** — its one caller is
  `replacePageContent`, which mints server-side because a restore has no client
  prediction to agree with. Both the `/blocks/paste` and `/blocks/bulk-duplicate`
  endpoints are deleted: one write path for a forest insert.
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

### Duplicate is copy + paste-in-place (`{ kind: "duplicate", placements }`)

Same op machinery, one gesture = one op = one undo entry however many roots:
each placement clones one selection root and lands it right after that root, and
the reducer arm is literally paste's (`insertForestAt`, shared). `serializeForest`
(`web/serialize-blocks.ts`) is the ONE forest serializer — copy and duplicate use
it, so "duplicate ≡ copy then paste after the source" is true by construction
rather than by two mirrored implementations agreeing.

- **A distinct op kind, not a fatter `paste`**, because `OP_LABELS`/`opFocusId`
  are keyed by kind: a duplicate must not read "Paste blocks" in the history.
- **A dead anchor drops only ITS placement**, where paste refuses the whole op.
  Paste's refusal is about not guessing a destination; a duplicate placement names
  its destination explicitly and independently. All-or-nothing would only ever
  fire server-side (the client built the op from rows that contain every anchor),
  so it would widen the never-confirming set from one clone to all of them.
- **Placements carry no `parentId`** — a clone always lands after its source, so
  the destination is never anchor-less. Keep it that way: `translateOpForStore`
  rewrites `parentId` only for the kinds that have one, so adding the field would
  silently skip anchor translation in an expanded sub-page.
- Placement order is not load-bearing (the array travels on the op, both sides
  fold it identically, and a clone always lands strictly between its source and
  that source's next sibling) — it is document-ordered for determinism only.

## A write names the fields it changes (`BlockPatch`)

> Restating a whole row asserts authority over fields you don't own.

`BlockPatch` is therefore an explicit create/update split, not an upsert
(`core/block-diff.ts`):

```ts
type BlockFieldChanges = Partial<Pick<Block, "parentId"|"type"|"data"|"rank"|"expanded">>;
interface BlockPatch {
  creates: Block[];                                    // full rows — a new row has no prior state
  updates: { id: string; changes: BlockFieldChanges }[];
  deleteIds: string[];
}
```

Two invariants fall out, and both used to be hand-maintained approximations:

- **A single-field writer cannot clobber a field it doesn't own.** `diffBlocks`
  reduces a whole-row `after` to `changedFields(before, after)`, and
  `patchesFromDiff`'s undo inverts *exactly that field set* — so a text
  projection authors `data` and says nothing about `type`. It is `commitRow`'s
  structural half: its callers still write `b => ({ ...b, data })`, but the diff,
  not the caller, decides what the patch claims. The incident: a projection flush
  firing from the unmount cleanup of a `/callout` conversion restated
  `type: "text"` over the callout the user had just picked. Reading render-fresh
  rows (`liveRowsRef`) narrows the window; the field scope removes it.
- **An update never creates**, which is what the retired `updateOnly` flag was
  approximating. An update naming a missing id is a skip *by definition* — in
  `applyPatch`, in `isPatchReflected` (vacuously absorbed, so the op confirms
  rather than replaying forever), and in the server writer. Only `creates` bring
  a row into existence, or back: a create whose id matches a soft-deleted row
  un-trashes it (undo of a page delete restores the whole subtree).

Consequences worth knowing:

- **Both patch predicates compare exactly the fields the patch NAMES**, over one
  shared comparator, so a patch can never be produced by one definition of
  "changed" and judged by another (`data` deep-compared with `dataEqual`, the
  SAME predicate the diff used to emit it). They still differ on the one axis
  above — `isPatchAbsorbed` counts `data`, `isPatchReflected` does not.
- **The server writes only the named columns** (`handle-patch-blocks.ts`).
  `parseBlockData` validates against the *effective* type, so a `data`-only
  change validates against the STORED type, and a `type`-only change
  re-validates (and re-mints) the stored blob against the NEW one. The
  page-type transition guard keys off writes that name `type`; `parkRanks` only
  runs for writes that name `parentId` or `rank`.
- **An update carries no `pageId`**, so the composite store resolves its owning
  page from the union rows (falling back to its cumulative row→page index for
  rows that left with a collapse) — `groupPatchByOwnerPage`. Creates still route
  by their own denormalized `pageId`, which is what makes the detached-persist
  path work for a collapsed page.

## Text is doc-owned: a row write can never say `text`

> A block's text has exactly ONE owner: its per-block `Y.Doc`.
> `page_blocks.data.text` is a ~1 s-debounced **projection** of it — one writer
> (`projectText`), one reader (the doc-init seed).

That writer only accepts values READ FROM the doc (`DocSourcedRuns`, see the
projection under *Per-block CRDT text*), so the projection cannot persist a
value it did not read from the owner.

Row text is writable at block **creation** only: a brand-new id has no doc, so
its row is that doc's only seed (`use-collab-block-doc.ts`). `insertAfter`,
`BlockOp.insert.data`, `split.tailData`/`split.runs`/`merge.runs` and
`BlockHandle.empty()` therefore keep taking text. An *edit* to an existing block
never does — and `RowData` (`core/row-data.ts`, `Record<string, unknown> &
{ text?: never }`) makes saying it a compile error, so `BlockEditorAPI.update` /
`convertTo` cannot express "convert this block AND set its text".

Exactly two functions in the row-write pipeline are allowed to name `text`, and
both exist to keep the projection out of everyone else's hands:

- **`preserveText`** (`block-editor-context.tsx`) — carries the row's existing
  projection across an `update`/`convertTo` untouched. A conversion keeps the
  block's id, hence its doc, hence its text, so the row must neither restate nor
  drop it. It DOES drop it when the target type is text-less (divider, image, …),
  whose strict schema rejects a stray `text` key with a 400 — resolved generically
  off the `Editor.Block` dispatch slot, so no call site branches on `acceptsText`.
- **`rowDataOf(data)`** (`core/row-data.ts`) — a stored blob minus `text`, for a
  control that must restate the block's OTHER fields (`update` replaces the blob).
  `handle.emptyRowData()` is the same derivation over `empty()`, and is what every
  convert site seeds from, so none of them hand-strips.

**Stripping text a conversion consumed is a content-doc edit, in this order.**
`convertStrippingText({ blockId, from, to, type, data })` is the ONE primitive
behind the slash menu, the gutter-`+` draft, and the markdown shortcuts:

1. delete `[from, to)` from the block's doc through `BlockFocusHandle.deleteRange`
   (`collab-text-surgery.ts`'s `deleteBlockTextRange` — `discrete: true`, so the
   binding's Yjs transaction lands synchronously);
2. `convertRow`, which writes the new `type` saying nothing about text — or, for
   a `wrapOnConvert` target, wraps instead of retyping.

**The wrap-vs-swap decision belongs to `convertRow`, the SHARED half.** It once
sat on `BlockEditorAPI.convertTo`, one level above, so `convertStrippingText`
bypassed it entirely and `/callout` from the slash menu retyped the origin into a
container — losing its text and 400ing on the callout's void schema — while
Turn-into wrapped correctly. A decision only one of two callers reaches is not
shared. Strip strictly BEFORE the wrap: the origin must lose its `/callout` query
from the content doc before it becomes the container's first child.

Both halves are load-bearing. A convert carrying the stripped text in its row
payload cannot strip anything — the row field is downstream of the doc — which
is how `/callout` used to leave the doc saying `/callout` while the row said
`text: []`, permanently, with which side the user saw depending on whether the
projection debounce had fired. And the strip must be `discrete` because the slash
commit runs INSIDE the caret menu's own `editor.update()`: a non-discrete nested
update commits on a microtask, racing the re-render the type write schedules.
No text type swaps its dispatch component any more (see the presentation-API
section below), so that race no longer costs an unmounted editor — but the
ordering stands on its own regardless of who renders the target: a row write is
downstream of the doc.
`e2e/convert-in-place-verify.ts` is the executable spec (type changed, marker
gone from DOM *and* `data.text`, the two in agreement, caret still in the block).

Backspace-reset / empty-Enter break-out strip **nothing** — a marker glyph was
never text — so they call plain `convertTo` and carry no payload but the target's
`emptyRowData()`.

## A text block's presentation is styling plus sibling regions

> Every text-bearing type dispatches the SAME component (`BlockTextRenderer`).
> A type change is a re-style, never a remount.

React unmounts when the element **TYPE at a position** changes. So the chain of
element types from the shared renderer's root down to `<LexicalComposer>` must be
constant, independent of `block.type`; props, classNames and styles may vary
freely. `components/text-block-layout.tsx` IS that fixed chain, and everything
else follows from it. (Same principle `BlockFrameProps` reaches on the container
axis: "a BACKDROP, not a wrapper".) Design:
[`research/2026-07-29-page-text-block-presentation-api.md`](../../../research/2026-07-29-page-text-block-presentation-api.md).

A type therefore declares `chrome` (`BlockChrome`) and never a `component`:

- **styling** of elements that always exist — `padding` (outside the box),
  `surface`, `boxClassName` (paint only), `inset`;
- **sibling regions** around the editable line — `regions.{header,start,end,footer}`.
  A region gets **no `children`**, so it structurally cannot wrap the line. The
  set is **closed by geometry** (a leaf in a box has two block-axis and two
  inline-axis neighbours), so a new type never needs a new position; `header` and
  `end` have no consumer today, which is the price of actually closing it.

`Editor.Block`'s registration is a union discriminated off the handle's `text`
lens, so a text-bearing type naming a `component` is a **compile error**, and
`excludeFromReorder` is on the text-less arm ONLY — `ReorderItemMiddleware` flips
between `<SortableReorderItem>` and a Fragment on that field, i.e. an element-type
flip on an ancestor of the composer.

Four constraints that are not stylistic:

- **`chrome` is a STATIC object**, built at module eval in the contribution
  literal, so a region component's identity is a module constant *by
  construction*. A `chrome(data)` function would be a place to mint a fresh
  component per render (resetting that region on every keystroke) and to call a
  hook inside a per-type conditional (crashing on conversion). The one
  data-dependent knob, `boxClassName`, returns a **string**.
- **Regions are `ComponentType`, not `ReactNode`** — a prebuilt node cannot
  degrade when `editor` is absent, and a region with hooks needs its own scope.
- **Three totality rules** (stated in `text-block-layout.tsx`, read them before
  editing it): every skeleton element renders unconditionally and none may be a
  primitive that could collapse to a Fragment; each region occupies exactly ONE
  children-array slot (React pairs unkeyed siblings by `fiber.index`, so a length
  change mis-pairs the leaf cell and remounts Lexical); nothing keys or branches
  on `block.type`.
- **`padding` is static and `boxClassName` is paint-only.**
  `BlockHandle.gutterFirstLineCenter` is a static per-type declaration, so
  per-row vertical padding would seat the gutter rail on a phantom line; and
  `overflow-*` would silently change caret scroll semantics (Lexical's
  scroll-into-view and `internal/caret-geometry.ts` resolve against the nearest
  scrollable ancestor).

`BlockTextEditor` is the LEAF (the Lexical pipeline, no layout) and is
deliberately **not exported** from the web barrel — that removes the
roll-your-own-text-component affordance outright. `read-only-view` renders the
same `TextBlockLayout` with the same `chrome`, swapping only the leaf
(`RunsRenderer`) and passing **no `editor`**, which is how a region knows to
degrade. Spec: `e2e/convert-in-place-verify.ts`'s DOM-node-identity round trip —
the only assertion that catches a skeleton element which vanishes.

Still out of scope, by construction: content aligned to the editable's *wrapped
line boxes* (line numbers, per-line comment anchors, a diff rail) — a sibling
column cannot know line boxes without measuring rects; and a per-type wrapper of
any kind. Cross-cutting affordances (comments, presence) are `Editor.BlockRegion`
render slots at the same four positions, not a fifth knob.

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
it and nothing else changes. It wires `internal/live-state-yjs-provider.ts`:
**in** = the `blockContentResource` keyed live subscription (`applyUpdate` with
provider origin — the echo guard), **out** = first-writer-wins `doc-init` seeding
(live doc hydrated ONLY from the server's authoritative response, closing the
duplicate-seed hazard) + debounced (~300 ms) `doc-update` posts of merged local
updates.

#### One owner per block, one session per binding

Lifetime lives in `internal/collab-session.ts` (read its module comment before
touching any of it):

> A block has ONE **owner** (`BlockDocOwner`) — canonical `Y.Doc`, transport
> provider, `Y.UndoManager` — and each mounted binding has ONE **session**
> (`CollabSession`) holding it. The session owns the replica's lifetime, the
> hold on the owner, and **the single retention policy**.

- **`session.end()` is the ONLY deferred teardown**, and it defers twice for two
  different reasons. One macrotask, because a remount-in-place keeps the very
  replica it holds — Lexical guards `providerFactory` AND `createBinding` behind
  refs (`@lexical/react` 0.44), so StrictMode's simulated remount never re-calls
  either, and `session.retain()` cancels the pending end. Then push-based onto
  the binding's own `disconnect()` while the replica is still CONNECTED
  (`BindingReplica.isConnected` / `setDisconnectListener`), so recovery racing an
  unmount cannot destroy a replica a live binding still relays through. Order
  inside one end is load-bearing: replica first (its disconnect's eager flush
  queues the last bytes), owner second (so `readyForTeardown` sees them).
- **Nothing releases by block id** — a session holds the owner *reference*, so a
  stale hold can never decrement the owner that replaced its own.
  `blockDocOwnerOf(id)` is the one id-keyed READ left, for the editor context's
  mutation chokepoints, which pair it with `captureBlockDocEdit(owner, edit)`.
- **The owner's refcount and undo-capture suppression are `private`.**
  Suppression is the *scope* of `captureEdit()`, not a field another listener
  reads, so "who raised it" has exactly one answer.

#### A session PROVES its hydration, and the proof gates the write path

> What this binding RENDERS equals what this session's replica HOLDS.

`SessionState` states it: `attaching → hydrating → hydrated | stalled`,
**monotonic** and **per session** (recovery is a new session), so a later
re-assert — the `markBlockRowConfirmed` doc-init, a second push, a StrictMode
re-`connect()` — cannot re-open a gate a proof already closed. Two arms, picked
at `start()` from the render-time `rowConfirmed`:

- **Locally authoritative** (`!rowConfirmed`, and all of memory mode): the
  content is this client's own deterministic seed, applied *after* the binding
  attached, so no remote answer can be missing and there is nothing to prove —
  `attaching → hydrated` inside one synchronous `connect()`. **This is what
  keeps the instant-split path instant**: `maybeInit()` returns immediately
  while the row is unconfirmed, so waiting on the server here would cost a
  freshly-split block a full round trip. It also makes `stalled` structurally
  unreachable in memory mode.
- **Server authoritative**: `hydrating` until the first `COLLABORATION_TAG`
  commit proves agreement — or until the transport announces `sync` with
  nothing renderable in the replica. That second exit is load-bearing: Yjs
  emits no event for an apply that integrates nothing, so **no commit is ever
  scheduled** and every genuinely-empty block would wait forever.

**The check cannot be synchronous.** `syncYjsChangesToLexical` commits without
`discrete` and `$commitPendingUpdates` is micro-tasked, while yjs emits
`doc.on('update')` at the tail of the same `applyUpdate` — inside our own
handlers the editor is exactly one microtask stale, so a same-turn comparison
calls every keystroke a blind binding. Hence the first-tagged-commit rule; the
tag also excludes Lexical's untagged initial commit and `$ensureEditorNotEmpty`'s
untagged follow-up. Do **not** force synchrony with `editor.read()` — from a Yjs
handler it re-enters `syncLexicalUpdateToYjs` inside that doc's own transaction
cleanup. The mount-time probe is `promoteOnly`: a merely-pending commit is
indistinguishable from a blind one, so it may confirm but never conclude.

Compare only `$xmlBasisContentLength()` against `xmlTextContentLength()` (the
fuzz-pinned pair — **agreement witnesses, not character counts**), measured on
the session's own **replica**: the canonical would import another binding's
concurrency into this verdict.

**It gates the WRITE path, never the editing host.** `hydrating` = the
projection does not persist and the transport does not flush.
`contentEditable={false}` would **deadlock the caret authority** (a
non-focusable root makes the landing's `root.focus()` a no-op, and `reconcile()`
only counts commits where the target is NOT rendered — it IS — so the flight
never ends and the keyboard is held). The replica is empty by construction at
attach, so typing into it is a legitimate concurrent edit that merges. The gate
is open in `attaching`, `hydrated` and `stalled` (a failure must not hold the
user's bytes hostage — it gets a Retry) and is released the moment `end()` is
called, so an unmount always flushes; a held queue is DEFERRED, never dropped.

**Placeholder:** `runsLength(runsOf(block.data.text))` — row non-empty + not
`hydrated` ⇒ skeleton at roughly that length (`HydrationPlaceholder`;
`primitives/loading`'s ~120 ms delay means a prompt doc unmounts it before it
paints); row empty ⇒ **nothing**, or most of a fresh page becomes a loading
screen; `stalled` ⇒ a Retry, right-aligned so it never covers the live line.

Until stage 5 (the diff-shaped `doc-init` pull) hydration is still the delivered
push, so the detector below stays the net for a push that never arrives.

### Projection + content-doc-aware split/merge

- **`doc → data.text` projection — a pure function of the OWNER.** It lives in
  the seam (`use-collab-block-doc.ts`), not in a consumer, and reads the
  canonical doc: `projectableRunsOf(entry.doc)` → `xmlTextToRuns`, which *is*
  `readYDoc(doc, e => serializeBlockRuns(e, extensions), …)` — the same walk and
  the same function object the live editor's own serialization uses, over a
  headless replica. Trigger: every canonical-doc update (push-based, local +
  server-applied), debounced ~1 s trailing. Changed runs go through `projectText`
  (`commitRow` with `record: false`, since Yjs owns text history) into the shared
  optimistic patch pipeline. It never echoes into any editor (`data.text` is read
  once, as the doc-init seed); skip-if-unchanged bounds churn; it flushes on
  teardown, never from a doc nothing ever wrote to. Rows trail the doc by ≤1 s,
  so search / backlinks / history stay fresh.

  **It may not read an editor — `projectText` takes `DocSourcedRuns`**
  (`internal/doc-sourced-runs.ts`): a brand keyed on a module-private `unique
  symbol`, produced only by `projectableRunsOf`, so persisting a value not read
  from the doc is a **tsc error** (same class as `PageForestTx` /
  `RowData`'s `{ text?: never }`). An editor is a VIEW that can silently fall
  behind — `@lexical/yjs` has no read-the-doc operation — and empty runs are
  indistinguishable from a legitimately empty block. Never swap `xmlTextToRuns`
  for a raw `toDelta()` walk: producing runs raw re-derives marks from
  `CollabTextNode` property sync, link nesting from embedded `XmlText`, and
  decorator tokens from node instances `ext.serializeNode(node)` needs. Counting
  gets away with a raw walk (`xmlTextContentLength`); producing runs does not.

  **The three other `serializeBlockRuns` callers stay editor-sourced.** Split /
  merge (`keyboard-plugin.tsx`) and `BlockFocusHandle.readRuns` want *what is on
  screen now, including uncommitted keystrokes* (`readRuns` is how `mergeNext`
  gets the next block's content without waiting the ~1 s projection). The
  discriminator: **a structural op reads the view; a persisted projection reads
  the owner.**

  **Flush-then-release is one cleanup in `useCollabDocHold`, in that order** —
  the final flush reads the canonical doc, so it must run while the hold still
  holds the entry. Do not split it across hooks and re-inherit the ordering from
  React's hook-declaration order.
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

### Inline markdown autoformat is ONE captured doc edit

Typing `**x**` bolds `x` and drops the delimiters (also `__x__`, `*x*`/`_x_`,
`***x***`/`___x___`, `~~x~~`, `` `x` ``). The requirement is **one Cmd+Z reverts
only the formatting, restoring the literal `**x**`** — so it goes through
`recordDocEdit` (→ `captureBlockDocEdit`), not a bare `editor.update`: the
`Y.UndoManager`'s 500 ms `captureTimeout` would fold the transform into the typing
run's item and one Cmd+Z would eat `**x**` whole. `stopCapturing()` on both sides
detaches it from the preceding run and stops later keystrokes merging in. Third
consumer of that fence, not a new mechanism.

- **`queueMicrotask` before applying is mandatory.** An update listener runs with
  `editor._updating === true`, so an `editor.update()` issued there is *enqueued*
  and begins after `captureBlockDocEdit` has closed its window — formatting still
  applies, undo boundary silently doesn't exist. `applyInlineFormat` **throws**
  rather than returning `false` there, since that is indistinguishable from a
  benign drift-abort. (Same deferral as split's.)
- **Tag-guarded (`historic`/`collaboration`/`paste`/`INLINE_FORMAT_TAG`), which is
  what makes undo reachable at all**: `um.undo()` re-inserts the delimiters and
  `@lexical/yjs` applies that tagged `historic`, so an unguarded listener
  re-formats instantly and Cmd+Z looks broken. The exactly-one-char-typed rule is
  a second defence, deliberately stricter than `@lexical/markdown`'s, which admits
  a *decreasing* offset and so auto-formats on **Backspace**.
- **Single-`TextNode` scope** (plus `isSimpleText()` — `splitText` on a segmented
  node or subclass slices characters that carry semantics). Makes the decorator
  tokens (`[[pageId]]`, `\(latex\)`) unreachable by any offset. Cost:
  `**see [[page]] here**` doesn't auto-bold; Cmd+B still does.
- **Marks set node-level, `hasFormat`-guarded** — byte-identically what
  `runs-lexical.ts` does, so `marksOf` reads back the same bits and the round-trip
  is correct by construction. The guard is why `` `code` `` inside a bold run adds
  code instead of clearing bold. Not `FORMAT_TEXT_COMMAND` (pulls in other
  listeners) nor `RangeSelection.formatText` (fresh selection has `format === 0`,
  making toggle-vs-set implicit over a partly-formatted range).

The delimiter table (`core/inline-markdown.ts`) is **closed core data, not a
slot** — block prefixes use `Editor.Block` because block types are an open set,
but `Mark` is a closed persisted `z.enum`. Its tests pin the marks as exactly
`MARK_ORDER` minus `underline` (no markdown syntax for it), so a sixth mark fails
the suite until someone decides its syntax. In `core/` because the clipboard
converter reads the same table.

### The same table, read left-to-right

`matchInlineFormat` answers "did the char I just typed close a span" — clamped to
the caret's line, closer at end-of-string. Clipboard export/paste asks about the
whole string, so the module carries a second pair over the SAME table
(`serializeInlineMarkdown` / `parseInlineMarkdown`), reached only through
`MdSerializeCtx.md` / `MdParseCtx.runs`. `ctx.plain` stays as the raw escape
hatch for a type whose syntax is not inline markdown at all (a fenced body, a
LaTeX expression). Read the module header for the escaping rule; three decisions
that look wrong until you know why:

- **`MarkdownContext.protectedSpans` is required, not optional.** Decorator
  tokens are plain substrings of `TextRun.text` and `\(latex\)` is full of `_`
  and `*` — an optional parameter is one a caller silently forgets. A masked span
  becomes its own UNMARKED run, byte-for-byte what `walkNode` gives a decorator.
  **Both runtimes supply it**: `blockTextProtectedSpans()` exists twice — over
  the web `registerBlockTextExtension` registry, and over the server's
  `Editor.InlineToken` contribution. They cannot drift: each token plugin
  contributes the same `core/` regex constant to both, only the Lexical
  (de)serialization halves being web-only.
- **The parser mirrors `matchInlineFormat`'s two whitespace rules**, so what the
  user can type and what pasted text parses as cannot diverge — which is why the
  serializer hoists boundary whitespace OUT of a marked group (`**a **` →
  `**a** `). Invisible when rendered; it is what makes `parse ∘ serialize` an
  identity rather than merely convergent.
- **`color` and `underline` get tags** (`<color value="…">`, `<u>`): color is a
  run attribute, not a mark, and underline is the one mark with no delimiter.
  `link` uses native `[text](url)`.

Two traps:

- **"Mark is OFF for text typed next" rests on a Lexical timing window, not an
  invariant** — the restored `selection.format` survives only via
  `markCollapsedSelectionFormat`, honored ~200 ms keyed on `(anchor.key, offset)`.
  `e2e/inline-format-verify.ts`'s ` tail` assertion is the only regression net; do
  not weaken it.
- **`markdown-shortcut-plugin.tsx` carries the same tag guard and advances
  `prevText` BEFORE its early return.** The guard stops our output (`~~- foo~~` →
  `- foo`) tripping a block conversion and closes a pre-existing hazard (a remote
  edit or Cmd+Z converting a block unprompted); skipping the baseline advance
  manufactures a phantom transition on the next keystroke.

Not guarded, deliberately: an in-flight `$$` math query can autoformat its LaTeX
(`$$a*b*`), `*` being intraword-legal. Coupling to `caret-trigger`'s arbiter was
rejected — candidacy is published even for a *dismissed* trigger, so one literal
`[[` in a line would silently disable autoformat for the rest of the node. The
right fix is the trigger owner consuming the keystroke.

### The hydration guard (a view may not overwrite what it disagrees with)

`@lexical/yjs` has NO read-the-doc operation: a binding ingests its doc solely
through post-attach `observeDeep` events, and the doc itself is hydrated solely
by the `page-block-doc` push. So both views of a block's text can silently fall
behind the one owner, and the symptom is identical — an empty block whose content
is safe on the server, restored by a reload. `collab-text-plugin`'s guard is what
makes that state observable and self-correcting:

- **`shown === 0 && doc > 0`** (armed by `CollabBlockDoc.subscribeDocUpdates`,
  read after a settle window) — the binding never hydrated. **`doc === 0 && row >
  0 && never edited here`** (from the row, after its own window, since a starved
  doc receives no doc updates to trigger on) — the doc is behind the server. Both
  compare against **zero**, which is what keeps them basis-free: the doc-side and
  editor-side length walks agree with each other but with no character count (see
  `$xmlBasisContentLength`).
- Recovery is one verb, `CollabBlockDoc.rehydrate()`: **end this block's content
  session and start a new one.** A new session IS a fresh EMPTY replica (the
  binding-behind-its-doc half) plus an authoritative re-read (the idempotent
  `doc-init` — the provider's ONLY read-side recovery, everything else there is
  write-side), so the guard never has to decide which side was short. The caller's
  only other job is bumping `attachGeneration` onto the `CollaborationPlugin`
  `key`: Lexical builds its binding once per mount behind a ref, so a changed key
  is the only thing that re-attaches one.
- **It is a DETECTOR, not a write gate.** It no longer stands in front of the
  projection: the projection reads the doc, so it cannot persist a blind
  binding's emptiness. What is left is a real, recoverable RENDER defect —
  reported (`collabHydrationReportSink` → `reports/collab-hydration`) because a
  silent self-heal is indistinguishable from a bug that never happened.

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
  its stored doc (DUPLICATED text on reopen). Keystrokes landing before the new
  block's editor is caret-ready are not dropped and not misrouted — the caret
  authority buffers them (see "The caret authority" above).
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
  is loss-safe: the session's deferred end finalizes the owner only when the provider is
  `readyForTeardown` (queue drained, or block server-confirmed gone), so an unmount
  during a transient outage RETAINS the owner and drains on the next reconnect edge.
  Known edge: closing the TAB while offline loses the last unflushed edits — the same
  class as an unflushed autosave.
- **The `data.text` projection dispatches an UPDATE, and an update never
  creates.** A row that is gone is skipped on BOTH the client overlay and the
  server writer, and `isPatchReflected` treats it as vacuously absorbed so the op
  confirms instead of sticking. Otherwise a debounced projection flush racing a
  history restore (or another tab's delete) resurrects the deleted row with
  pre-delete text. The patch's SHAPE is the guarantee — there is no flag to set,
  or forget.
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

## Markdown is a LOSSLESS PROJECTION of the forest

> Lenient on parse (foreign markdown pastes as it always did), CANONICAL on
> serialize: anything this codebase emits re-parses to the same forest.

`core/markdown.ts` stays the pure orchestrator that never names a block type. Its
void fallback is now the generic **`tag`** (`<name attrs>…</name>`, body parsed
recursively) instead of `() => ""` — which is why a type with no markdown
declaration at all (callout, image, video, audio, file, embed, bookmark) is
covered. Design:
[`research/2026-08-03-page-markdown-block-roundtrip.md`](../../../research/2026-08-03-page-markdown-block-roundtrip.md);
`markdown.test.ts`'s fuzzed round-trip property test is the executable statement
— extend it for a new block type rather than adding a one-off case.

- **Only STRING fields become plain attributes**; everything else (numbers,
  booleans, `null`, objects) is JSON-encoded into one `data` attribute. An
  attribute value is a string both ways, so `width="640"` would read back as the
  string `"640"` — the "prettier" projection is lossy exactly where it claims not
  to be. Override `attrs` + `parseAttrs` TOGETHER for a nicer form.
- **`body` is declared, never derived** — and specifically not from
  `collapsible: "always"`, whose set includes `toggle`, which must keep emitting
  its children folded. `"children-when-expanded"` exists for `page` alone.
- **The walk takes an explicit "consumed my children" signal** from the
  serializer; it recurses unconditionally otherwise. Do not infer it.
- **A typing shortcut and markdown line syntax are two different declarations.**
  `markdownPrefixes` is markdown syntax and feeds serialize + parse + typing;
  `typingPrefixes` converts on TYPING only and this module never reads it.
  `quote` types with `| `, which in markdown is a **table row** — one field for
  both would make a pasted markdown table a wall of quotes. Same for `to-do`'s
  `[] `, `code-block`'s ```` ``` ````, `equation`'s `$$`, `divider`'s `---` and
  `todo`'s `TODO `, each of whose real markdown is declared elsewhere on the
  handle. `conversionPrefixesOf` (the union) has exactly one consumer, the
  shortcut plugin; `page.editor:block-prefixes-unique` keeps two types off one
  prefix.
- **`prompt` declares `body: "text"`** because it is the only text-bearing type
  with no MARKDOWN prefix; without it it serialized as a bare paragraph and came
  back as `text`. (`quote` had the same problem — `> ` belongs to `toggle` — but
  it is a void container now, so its tag carries `children`.)
- **`page/text` emits `<text/>` for an EMPTY paragraph** only. Blank lines stay
  skipped on parse — correct CommonMark for foreign markdown. The asymmetry is
  the contract: what we emit round-trips, what a user pastes stays lenient.

### The page tags

`<page id="…"/>` needs a row id, which `SerializedBlock` deliberately lacks — so
the serialize walk takes the wider `MarkdownNode` (`… id?: string`) and
`web/serialize-blocks.ts` stamps `id: block.id`. Both its consumers overwrite it
(`withMintedIds`): the id is provenance, never a destination identity.

- `page-link` owns `<page>` on parse; the sub-page handle's tag is
  `serializeOnly` (two non-`serializeOnly` handles on one name is a loud error).
  **Markdown parse alone can never mint a sub-page** — that means minting a
  `page_id` partition and restamping a subtree, which only the server's
  turn-into-page op does. The id is what lets a future diff/merge reconcile
  against the EXISTING row.
- A **body on a parsed `<page>` is a loud rejection**, so authoritative sub-page
  writes can be enabled later without a syntax change.
- A parsed forest is uniformly `expanded: true` — a self-closing tag cannot
  distinguish "collapsed" from "childless", and blocks are born expanded.

### Reserved attributes: a tag may carry facts the block does not own

A TODO card's linked task and that task's status live in another table keyed by
the block id, so no projection of `data` can produce them — and putting them in
`data` would make the block's row a drifting second copy of somebody else's
record. `BlockTag.annotated: readonly string[]` is `identified` generalized: a
declared SET of names, reserved in BOTH directions, whose values the CALLER
supplies (`MarkdownNode.annotations` → `MdSerializeCtx.annotations`) rather than
the walk.

- **Serialize** emits reserved names first (`id`, then annotations in
  declaration order, then the type's own attrs). An absent value OMITS its
  attribute — the clipboard has neither ids nor annotations and must still
  serialize.
- **Parse** deletes every reserved name before `dataOf`, exactly where `id`
  comes off. Otherwise the round trip is not closed: a void `z.object({})`
  strips the unknown key (the attribute is decorative), a `.strict()` one 400s
  on a document this side emitted.
- **The values are DISCARDED on parse ⇒ these attributes are READ-ONLY.** The
  parser is pure: it cannot tell an agent's edit from the value it emitted a
  minute ago, nor write the owning table. `status="done"` typed into a document
  is ignored, and the tool handing out the document says so.

Loud, never silent: a name colliding with a schema field / `data` / an
`identified` `id` throws at resolution; a type's own `attrs` emitting a reserved
name throws at serialize; and a node carrying an annotation its tag never
declared (or any annotation at all, for a type serializing as LINES) throws —
emitting it would make it a `data` key on the way back in, dropping it would
lose a fact its supplier believes the document carries.

**Who fills them in is a server registry**: `Editor.BlockAnnotation` takes the
rows a read is about to walk and answers block id → attribute record;
`resolveBlockAnnotations(rows)` merges every provider and throws when two claim
one `(block, attribute)` pair. `markdown-apply`'s read resolves it *after*
`redact`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Block-based document editor component and slot system. Block-based document editor — tables, routes, and live state.
- Web:
  - Slots:
    - `Editor.Block` ← `page.annotations.agent-notes`, `page.annotations.context`, `page.annotations.private-notes`, `page.annotations.todo`, `page.audio`, `page.bookmark`, `page.bulleted-list`, `page.callout`, `page.code-block`, `page.divider`, `page.embed`, `page.file`, `page.heading.heading-1`, `page.heading.heading-2`, `page.heading.heading-3`, `page.image`, `page.math.equation`, `page.numbered-list`, `page.page-link`, `page.prompt.block`, `page.quote`, `page.sub-page`, `page.text`, `page.to-do`, `page.toggle`, `page.video`
    - `Editor.BlockFrame` ← `page.annotations.agent-notes`, `page.annotations.context`, `page.annotations.private-notes`, `page.annotations.todo`, `page.callout`, `page.quote`
    - `Editor.TurnInto` ← `page.turn-into-page`
    - `Editor.FormatAction` ← `page.formatting.bold`, `page.formatting.code`, `page.formatting.color`, `page.formatting.italic`, `page.formatting.link`, `page.formatting.strikethrough`, `page.formatting.underline`
  - Uses:
    - `infra/endpoints.EndpointError`
    - `infra/endpoints.fetchEndpoint`
    - `primitives/announce.announce`
    - `primitives/auto-scroll.useEdgeAutoScroll`
    - `primitives/copy-to-clipboard.useCopyToClipboard`
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
    - `primitives/css/ui-kit.ControlSizeProvider`
    - `primitives/css/ui-kit.SURFACE_LEVELS`
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
    - `primitives/networking.subscribeWsStatus`
    - `primitives/optimistic-mutation.enqueueResourceWrite`
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
    - `primitives/text-editor/caret-motion.announceCaretCrossing`
    - `primitives/text-editor/caret-motion.CARET_CROSSED_COMMAND`
    - `primitives/text-editor/caret-motion.crossCaret`
    - `primitives/text-editor/caret-trigger.atWordBoundary`
    - `primitives/text-editor/caret-trigger.CaretTriggerMenu`
    - `primitives/text-editor/caret-trigger.useCaretMenu`
    - `primitives/text-editor/caret-trigger.useCaretQuery`
    - `primitives/text-editor/caret-trigger.useForcedCaretQuery`
    - `primitives/text-editor/decorator-nav.DecoratorNavPlugin`
    - `primitives/undo-redo.useScopedUndoRedo`
    - `reorder.isNodeData`
    - `reorder.TopLevelEntry`
    - `reorder.useReorderedEntries`
    - `shell/toast.showToast`
  - Exports (types):
    - `BlockAnchorProps`
    - `BlockChrome`
    - `BlockContribution`
    - `BlockEditorAPI`
    - `BlockEditorHandle`
    - `BlockFrameMeta`
    - `BlockFrameProps`
    - `BlockPasteHandler`
    - `BlockRegion`
    - `BlockRegionProps`
    - `BlockRegions`
    - `BlockRendererProps`
    - `BlockSection`
    - `BlockTextExtension`
    - `BlockTextPluginProps`
    - `CaretFlightAbortReason`
    - `CaretFlightAbortReport`
    - `CaretSurface`
    - `CaretSurfaceRef`
    - `CollabHydrationReason`
    - `CollabHydrationReport`
    - `FormatToolbarValue`
    - `MarkButtonProps`
    - `PageIconProps`
    - `PageOption`
    - `PageOptionsResult`
    - `TextBlockLayoutProps`
  - Exports (values):
    - `BLOCK_INDENT`
    - `BLOCK_INSET`
    - `BlockEditor`
    - `BlockTextRenderer`
    - `BlockTypeList`
    - `caretFlightReportSink`
    - `collabHydrationReportSink`
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
    - `TextBlockLayout`
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
    - `AfterCommit`
    - `Block`
    - `BlockCreateHook`
    - `BlockDeleteHook`
    - `BlockRestoreHook`
    - `BlocksChangedPayload`
    - `BlockTrashHook`
    - `DeletedBlockRow`
    - `PageContentSnapshot`
    - `PageData`
    - `PageForestTx`
    - `StoredBlock`
  - Exports (values):
    - `_blocks`
    - `applyPageBlockPatch`
    - `BlockLifecycle`
    - `blocksChanged`
    - `BlockSchema`
    - `blocksLiveResource`
    - `blockTextProtectedSpans`
    - `deleteBlocksSubtree`
    - `Editor`
    - `PAGE_BLOCK_TYPE`
    - `pageData`
    - `PageDataSchema`
    - `pagesLiveResource`
    - `replacePageContent`
    - `resolveBlockAnnotations`
    - `serializePageContent`
  - Register:
    - `defineTriggerEvent('page.blocksChanged')`
    - `defineTrashSource('pages')`
  - Routes:
    - `GET /api/pages`
    - `GET /api/pages/:pageId/blocks`
    - `GET /api/blocks/:id/page`
    - `POST /api/blocks`
    - `PATCH /api/blocks/:id`
    - `DELETE /api/blocks/:id`
    - `POST /api/blocks/:id/move`
    - `POST /api/blocks/:id/turn-into-page`
    - `POST /api/pages/:pageId/blocks/op`
    - `POST /api/pages/:pageId/blocks/patch`
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
    - `BlockAudience`
    - `BlockData`
    - `BlockDiff`
    - `BlockFieldChanges`
    - `BlockHandle`
    - `BlockMarkdown`
    - `BlockNode`
    - `BlockOp`
    - `BlockOpContext`
    - `BlockPage`
    - `BlockPatch`
    - `BlockTag`
    - `BlockTagBody`
    - `BlockTextVariant`
    - `BlockUpdate`
    - `ColorToken`
    - `CreateBlockBody`
    - `IdentifiedBlock`
    - `InlineFormatContext`
    - `InlineFormatMatch`
    - `InlineSyntax`
    - `IsAnchor`
    - `Mark`
    - `MarkdownContext`
    - `MarkdownNode`
    - `MdParseCtx`
    - `MdSerializeCtx`
    - `MoveBlockBody`
    - `PageCover`
    - `PageData`
    - `PageRow`
    - `RichText`
    - `RowData`
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
    - `BlockFieldChangesSchema`
    - `BlockOpSchema`
    - `BlockPageSchema`
    - `BlockPatchSchema`
    - `BlockSchema`
    - `blocksResource`
    - `canIndent`
    - `canOutdent`
    - `changedFields`
    - `childrenOf`
    - `coalesce`
    - `collapsedAnchorAbove`
    - `COLOR_TOKENS`
    - `colorCssValue`
    - `conversionPrefixesOf`
    - `createBlock`
    - `CreateBlockBodySchema`
    - `dataEqual`
    - `defaultTextHandle`
    - `defineBlock`
    - `deleteBlock`
    - `diffBlocks`
    - `getBlockPage`
    - `IdentifiedBlockSchema`
    - `inDocumentOrder`
    - `INLINE_SYNTAXES`
    - `isEmptyPatch`
    - `listBlocks`
    - `listPages`
    - `MARK_ORDER`
    - `markdownParseTagName`
    - `markdownTagIsIdentified`
    - `marksOfTextNode`
    - `matchInlineFormat`
    - `mergeRuns`
    - `moveBlock`
    - `MoveBlockBodySchema`
    - `namesField`
    - `newBlockId`
    - `nextVisibleLine`
    - `opBlockIds`
    - `PAGE_BLOCK_TYPE`
    - `pageBlockHandle`
    - `pageBlockMarkdown`
    - `PageCoverSchema`
    - `pageData`
    - `PageDataSchema`
    - `PageRowSchema`
    - `PAGES_TRASH_SOURCE`
    - `pagesResource`
    - `parseInlineMarkdown`
    - `parseMarkdownToForest`
    - `pasteAnchorId`
    - `patchBlocks`
    - `patchesFromDiff`
    - `plainOf`
    - `planForestInsert`
    - `prevVisibleLine`
    - `rankWindow`
    - `RichTextSchema`
    - `rowDataOf`
    - `runsLength`
    - `runsOf`
    - `runsOfNode`
    - `runsToLexical`
    - `runsToXmlText`
    - `serializeBlockRuns`
    - `SerializedBlockSchema`
    - `serializeForestToMarkdown`
    - `serializeInlineMarkdown`
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
    - `visibleChildrenOf`
    - `visibleChildRule`
    - `withMintedIds`
    - `withRuns`
    - `xmlTextContentLength`
    - `xmlTextToRuns`
- Cross-plugin:
  - Imported by:
    - `active-data/page-link`
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
    - `page/annotations`
    - `page/annotations/agent-access`
    - `page/annotations/agent-notes`
    - `page/annotations/agent-notes/authorship`
    - `page/annotations/context`
    - `page/annotations/private-notes`
    - `page/annotations/todo`
    - `page/annotations/todo/task-link`
    - `page/attachment-block`
    - `page/audio`
    - `page/bookmark`
    - `page/bulleted-list`
    - `page/callout`
    - `page/code-block`
    - `page/container`
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
    - `page/markdown-apply`
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
    - `primitives/css/ui-kit`
    - `reports/caret-flight`
    - `reports/collab-hydration`
  - Extended by:
    - `apps/pages/agent-origin` (table `page_blocks_ext_origin`)
    - `apps/pages/starred` (table `page_blocks_ext_starred`)
    - `apps/story/marker` (table `page_blocks_ext_story`)
    - `page/annotations/todo/task-link` (table `page_blocks_ext_todo_task`)
  - Endpoint callers: `editor-collab`

<!-- AUTOGENERATED:END -->
