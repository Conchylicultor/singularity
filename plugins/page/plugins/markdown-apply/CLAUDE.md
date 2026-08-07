# markdown-apply

Applying an edited markdown document onto an existing block forest **without
re-minting block ids**. `replacePageContent` is the other whole-page write and it is
correct for its one caller (history restore, where fresh ids are load-bearing);
as an *editing* path it detaches every block's content `Y.Doc`, its
`Y.UndoManager` history, its `page_links` edges, its `tasks_ext_prompt_block`
link and every entity-extension row keyed on block id. Design:
[`research/2026-08-03-page-markdown-apply-to-existing-forest.md`](../../../../research/2026-08-03-page-markdown-apply-to-existing-forest.md).

## The root is the scope; the page is the transaction

`readBlockAsMarkdown(blockId, {redact})` / `applyMarkdownToBlock(blockId, md)`
take **any block**, not a page. A page id is simply the root at depth 0, so
`readPageAsMarkdown` / `applyMarkdownToPage` are the same call — they exist
separately only to *assert* their id is a page (the snapshot coming back is that
proof), so "this page" cannot silently mean "the page around this block".

> `rootId` bounds everything. `existing` is still the whole `page_id`
> partition — the rank floor and the sub-page pin need rows the walk may not
> reach — but survivors, updates and **`deleteIds` all derive from `oldRows`,
> the walk's output**. One line, no second filter to keep in sync.

The root itself is scope, not content: the walk starts at its CHILDREN, so it
has no line in the document and no write can name it.

- **`pageId` is a second required arg, never inferred from `rootId`.** A nested
  root cannot name its own page; created rows join a *partition*, not a position.
- **`subpage-removed`** — an absent shell is re-homed to `rootId` above the rank
  floor, which is right when the root IS the page and would drag a whole page
  tree INTO the addressed block when it is not. So under a nested root it
  refuses. Unreachable in practice (a scoped read emits every shell in scope),
  which is why it is loud.
- **`redact` filters the WALK and nothing else.** Pruning a row prunes its
  subtree for free; `existing` stays the whole partition, so a hidden row is
  invisible without being absent — it still reserves its rank against a
  collision, and still makes a `ref` naming it `ref-out-of-scope` rather than
  `unknown-ref`. Read and apply take the SAME-shaped option so one function
  serves both; redacting differently would diff against a document nobody saw.
  The engine never learns what a redaction *is*.
- The WRITE is still whole-page: `applyPageBlockPatch` locks the entire forest
  either way, because `(parent_id, rank)` is one ordering space.

## Two channels, because they have two owners

`planMarkdownApply` returns a `BlockPatch` **and** a separate `textEdits` list.
Structure is `page_blocks` rows under the page lock; text is the per-block
`Y.Doc`. The engine never mixes them:

> **A survivor's update never names `text`.** The `data` a survivor's update
> carries always restates the block's CURRENT projection verbatim (the same
> thing `preserveText` does for an editor conversion). A changed text leaves
> through `textEdits`.
>
> **A survivor's update never names `expanded`.** A parsed forest is uniformly
> `expanded: true`, so writing it would unfold every collapsed toggle, callout
> and sub-page on the page, on every apply.

Text for **newly created** blocks does ride `creates[].data.text` — legal and
required: a brand-new id has no doc, so its row is the seed.

The plan is a pure function of current state, so re-running an apply converges.
That is the recovery story for a write that fails between the two channels; do
not add a retry that assumes it saw the previous attempt.

## The page title is a READER-SIDE PREFIX, not a node (`core/page-title.ts`)

A PAGE-rooted read opens with `# <title>` — a string prepended AFTER the
serialize walk and stripped BEFORE the parse. The root stays scope, not content,
and the title handling adds **zero authority of its own**.

- **Emit and strip in ONE module**, for `flatten.ts`'s reason: disagree by a byte
  and the apply is a diff against a document nobody saw.
- **Only `rootId === pageId`.** A banner on a card-scoped read would come back as
  an `# H1` minted INSIDE the card.
- The title goes through the **same inline serializer** as every other line and
  its line terminators collapse to a space, so it cannot forge structure in the
  document the agent acts on.
- **The strip's only test is byte-identity** with the banner built from the
  page's CURRENT STORED title. A rename, a spliced-into banner and the page's own
  first heading are indistinguishable from here, so all of them fall through to
  the planner as a created heading and are refused. A deleted banner strips
  nothing and deletes nothing — it was never a row.
- **Known bound:** deleting ONLY the banner line, on a page whose first block is
  an H1 reading exactly the title, strips that H1 block instead. Telling the two
  apart needs the banner to be a node, which is what this refuses to make it.

`BlockScope` carries `title` because `loadBlockScope` is the only place it exists
without a second query — a page's own row is not in its content partition.

## Alignment: three passes, weakest evidence last

1. **LCS over identity keys** (`diffArrays`). This is why the engine exists in
   this shape. A page with five identical `- item` lines has five identical
   keys; the pages-history content bucket (`build-diff.ts`, the prior art)
   pops them in arbitrary order, so editing one re-pairs the lot. An LCS pairs
   them **by position**, the only answer available.
2. **Similarity within an alignment gap** — the anchors already assert that this
   region corresponds, so what is left there is an edit.
3. **Similarity across the whole document** — this is what lets a block that
   MOVED keep its id. A move is a removal in one gap and an insertion in
   *another*, which pass 2 can never pair.

**There is deliberately no similarity threshold.** Admission is the gate — same
type OR same plain text — and similarity only ranks. A normalized edit distance
punishes short text for being short (appending one word to `bravo` scores 0.38,
rewriting half a long paragraph scores 0.5), so any cut-off either drops the
commonest agent edit or admits everything anyway; and every pair a threshold
rejects becomes a delete plus a create, i.e. exactly the identity loss this
plugin exists to prevent. Stated bound: replacing a paragraph with an unrelated
one of the same type reads as an EDIT, so per-block metadata follows the
position rather than the words — the call every line-oriented diff makes.

## Asserted identity: pins

A node whose identity is **asserted** (a row id in the document) rather than
inferred (content similarity) is a `pin`, settled in its own pass after the three
content passes. Two sources, one mechanism, one refusal vocabulary:

- a **sub-page shell**, whose `<page id="…"/>` pointer is its only identity;
- an **identified card** — a tag declaring `markdown.tag.identified`, which
  round-trips its row id as the reserved `id` attribute. The type set is derived
  from the handle registry via `markdownTagIsIdentified`, **never named here**.

A stored identified card is pinned even when the document does not name it —
otherwise a tagless `<agent-note>` written beside it shares its byte-identical
void content key and can absorb its row id (and its authorship) through an LCS
ambiguity.

Three refusals, resolved in this order: **`ref-duplicated`** (one row, two
positions), **`ref-out-of-scope`** (a real row the walk cannot reach — another
branch, or redacted; this is what stops a page-rooted edit dragging a hidden card
into scope and MOVING it), **`unknown-ref`**. `unknown-ref` gets no "already in
this document" hatch, unlike `<page>` below: an id on an identified tag is *only*
ever an identity claim, so a typo must never quietly become a create.

**There is no `note-removed` twin of `subpage-removed`, deliberately.** A shell
owns another partition the document cannot see, so an omission there destroys
invisible content; a card owns only lines the document shows, so omitting one is
an ordinary, fully-informed delete.

## Sub-pages are never deleted

A shell owns an entire other `page_id` partition. Its identity is its ROW ID,
which `<page id="…"/>` carries and no `data` field does — and the engine reads
that id back **by serializing the incoming pointer node and comparing the line**,
never by naming a block type or a `data` field. The tag is the contract; the
serializer is the only thing that knows how a type encodes its identity into one.

- A shell **absent** from the incoming markdown is preserved, re-homed to the top
  level after everything the document did place (the `replacePageContent`
  rank-floor idiom). It stays exactly put only when it already sits above that
  floor. Anywhere else it moves, because its own sibling list was re-ranked
  without it and the only interval provably free of a `(parent_id, rank)`
  collision is above the floor. Under a **nested root** this is
  `subpage-removed` instead — see *The root is the scope* above.
- A `<page id="…"/>` that is neither a live sub-page here nor a reference the
  document ALREADY holds is `unknown-ref`. That second half is not a softening:
  the same tag is how an ordinary link-to-page block serializes, so refusing
  every id that is not a sub-page would break every such block on every apply.
  What is refused is *inventing* a page reference, which a pure planner cannot
  verify. Repositioning a shell within its page is legal; naming it twice is
  `ref-duplicated`.

A `page` node in the incoming forest **throws** rather than refusing — markdown
parse can never produce one, so it is a programming error, and minting a
`page_id` partition is `turn-into-page`'s job.

## Ranks are minimal, per sibling list

Per parent, the longest strictly-increasing subsequence of the survivors' stored
ranks is **fixed** and keeps its rank byte-for-byte; only the complement is
minted, one `Rank.nBetween` per maximal run between fixed neighbours. Reordering
one paragraph costs one rank, not a rewritten sibling list. Where two
subsequences are equally long the choice is arbitrary — the tests assert the
COST (one write) and that applying the plan reproduces the asked-for document,
never which of two equally-minimal answers came out.

**A rank held by a row the walk could not reach is an OBSTACLE, at BOTH mint
sites** (`planSiblingRanks`' `reserved`, and the preserved-shell floor).
`Rank.nBetween` is deterministic, so the midpoint of `(A, B)` reproduces the key
of a hidden row inserted between A and B, byte for byte — the live unique index
then fails the whole apply, on the most ordinary edit there is. A survivor
*leaving* a sibling list is deliberately not an obstacle: its own update vacates
the key in the same transaction. Without `redact` the obstacle set is empty.

An obstacle only picks a run's FLOOR, which is the whole of the resulting
guarantee:

> **Stated bound, unconditional: blocks inserted where a hidden row sits land
> AFTER it, contiguously.**

Either side satisfies the author's intent equally — they could not see the row —
so the tie-break is decided by what else is at stake, and that is CONTIGUITY.
The movers are consecutive in the incoming document; interleaving them around
the obstacles would wedge a human's hidden card inside a sequence the agent
authored as a unit and break the authored order, while buying nothing: the
hidden row sits strictly between the same two visible survivors either way,
which is the only position it can be said to have.

## `StoredRow` is a local structural type

`page/editor`'s `StoredBlock` lives behind its SERVER barrel, which a `core`
module may not import. `core/stored-row.ts` declares the five columns this
engine reads; the server-side caller passes `StoredBlock[]` straight in and tsc
proves the two agree at that one call site.

## The acceptance predicate: what a write may DO (`core/touched.ts`)

`redact` decides what a write may **see**. `assertAcceptable` decides what it may
**do**. They are duals, and both are caller-supplied, so the engine still never
learns what an audience is: one takes rows and returns rows, the other takes a
plan and either returns or throws.

- `touchedBlocks(plan)` flattens the plan to four ids-by-channel lists;
  `boundaryViolations({plan, existing, rootId, isBoundary})` judges them against
  a caller-supplied ROW PREDICATE. **No block type is named here** — naming one
  inverts `agent-access` → `markdown-apply` into a cycle. It returns violations
  rather than throwing (status and wording are the caller's), and throws for
  exactly one thing: a non-terminating ancestor chain, bounded by
  `existing.length + creates.length`, as `chainToPageRoot` does.
- **Both chains, not just the new one.** created → new, deleted → old,
  updated / text-edited → **BOTH**. A block whose new chain reaches a boundary is
  not thereby legal: re-indenting the page's prose into a card is a MOVE, and
  since the aligner preserves the id of byte-identical text it arrives as an
  `update` naming `parentId` — so an after-only test lets an agent annex the whole
  page into its own card without deleting a character (`escaped-origin`). The old
  chain resolves against PRE-plan maps, so moving a block's ancestor in the same
  plan cannot launder the block through it.
- **Field-level, not row-level.** Minting a card re-ranks its prose siblings, so
  `updates` names prose rows in the ORDINARY case: a rank-only (or
  `expanded`-only) update is exempt; `type`, `data`, `parentId`, `deleteIds` and
  text edits are judged. Without the carve-out the predicate refuses the feature.
- **`ApplyBlockOptions.assertAcceptable` runs once, synchronously, after planning
  and strictly before the first `applyPageBlockPatch`**, so a refusal has provably
  written nothing. It gets the UNREDACTED partition — a chain walk needs ancestors
  the document never showed. Deliberately **no exported `plan`/`commit` pair**: a
  caller could commit a plan against rows it re-read, and no type can express
  "these two came from one read".

## The write order (`server/internal/apply.ts`)

Structure first (one `applyPageBlockPatch` = one locked transaction), then text
— because `page_block_docs.block_id` FKs onto `page_blocks.id`, so a created
block has no row to hang a doc off until the patch lands. Within a block, the
DOC before the ROW: `data.text` is a projection, so a row write is downstream.
The row projections batch into one final patch; every doc write still precedes
every row write.

**The projection is not optional.** `useTextProjection` needs a *mounted*
editor, so a doc written for a page nobody has open would leave `data.text`
stale forever — and search, backlinks, history and `read-only-view` all read it.
The applier writes the value a mounted client eventually would, so a later
client flush is an empty diff rather than a fight.

## The seed race is closed by a return value

`initBlockDoc` is first-writer-wins **and returns the authoritative state**, so
the applier compares the bytes back with the bytes sent: same ⇒ it won and the
doc is correct; different ⇒ a browser seeded first, so continue down the edit
path against the winner's state. Nothing is merged blind.

The server's seed `clientID` mirrors `use-collab-block-doc.ts`'s FNV-1a
derivation with an EMPTY extension-set fingerprint, so it deliberately differs
from a browser's for the same runs — that is the determinism contract working:
different extension sets build structurally different seeds and must not share
item ids.

## The character-level trim is the binding's own diff

`server/internal/runs-splice.ts` aligns the paragraph's leaf units (text /
line-break / link) and leaves the common prefix and suffix as the SAME nodes.
The motivating edit — one word in one paragraph — leaves one text unit on each
side, applied with a single `setTextContent`; `@lexical/yjs` then splices only
the changed span via its own `simpleDiffWithCursor`, i.e. the delta a human
typing it would have produced. A second character diff here would only give the
binding something to disagree with.

Everything else rebuilds just the middle through the SHARED `$appendRuns` walk.
A doc that is not a single paragraph — a shape nothing in this system produces —
is rebuilt wholesale: correct, not identity-preserving, stated not hidden.

## Known gap: a doc holding an inline decorator node

`[[pageId]]` / `\(latex\)` are plain characters in `TextRun.text` (which is why
`protectedSpans` alone made markdown conversion server-safe) — but in a doc a
BROWSER wrote they are decorator NODES whose Lexical class lives in a web
plugin. `readStateRuns` refuses such a doc up front, naming the token type
(detected without hydrating: a decorator is the only thing `@lexical/yjs` stores
as a `Y.XmlElement`). **Do not "fix" it with a stub class** — a synthesized node
has no `getTextContent`, so the token would serialize to `""` and the splice
would silently delete it. Closing it properly needs the server twin of
`registerBlockTextExtension`'s NODE half. Bounded: `read_page` is unaffected, and
only an EDIT to a block containing a token is refused.

## No MCP tools here: this plugin is the ENGINE

The agent-facing triple — `read_page`, `write_agent_note`, `edit_page` — lives in
[`page/annotations/agent-access`](../annotations/plugins/agent-access/CLAUDE.md),
which is the POLICY over this engine. (`edit_page` was once an export of this
plugin, then deleted; it came back over there under a contract that judges the
diff. That reversal is argued in the policy's own doc — the engine's shape is
unchanged either way.)

The split is not filing. A tool names a concrete block type, which a generic
engine must not, and the two predicates it hands in are POLICY, not projection:

> `redact` decides what a write may **SEE**. `assertAcceptable` decides what it
> may **DO**.

Both are caller-supplied, and neither teaches the engine what an audience is: one
takes rows and returns rows, the other takes a plan and either returns or throws.
So what is left here takes a root, a row filter and a boundary predicate, and a
second policy (export, share link) reuses it without adding a branch.

The end-to-end spec moved too — `agent-access/e2e/agent-access-verify.ts`.

**Agent-origin provenance does not apply, on purpose.** That hook reads
`x-singularity-origin` off an HTTP `Request` and marks whole PAGES an agent
created; an apply has no `Request` and never creates a page. Synthesizing the
header would mark a human's page as agent-origin and hand it to the 24h sweep.

## `markdownNodesOfRows` and the plan share ONE traversal

The caller serializes with `markdownNodesOfRows` and diffs with the same
`core/flatten.ts` walk. If the two disagreed, the plan would be a diff against a
document nobody ever saw — which is why both live in one module over one
`childrenByParent` index, rather than each re-deriving "rank-ordered DFS from the
root". Both take `rootId`; a redaction must therefore be applied to the ROWS
handed to the walk, never to the emitted markdown.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Apply an edited markdown document onto an existing page's block forest without re-minting block ids: the block-scoped read, the structural patch, and the per-block content-doc splice. Audience-agnostic — the agent-facing tools over it are page/annotations/agent-access.
- Server:
  - Uses:
    - `database.db`
    - `infra/endpoints.HttpError`
    - `page/editor-collab.initBlockDoc`
    - `page/editor-collab.loadBlockDoc`
    - `page/editor-collab.mergeBlockDocUpdate`
    - `page/editor._blocks`
    - `page/editor.applyPageBlockPatch`
    - `page/editor.blockTextProtectedSpans`
    - `page/editor.Editor`
    - `page/editor.PAGE_BLOCK_TYPE`
    - `page/editor.serializePageContent`
    - `page/editor.StoredBlock`
  - Exports (types):
    - `ApplyBlockOptions`
    - `ApplyReport`
    - `BlockScope`
    - `ReadBlockOptions`
  - Exports (values):
    - `applyMarkdownToBlock`
    - `applyMarkdownToPage`
    - `loadBlockScope`
    - `readBlockAsMarkdown`
    - `readPageAsMarkdown`
    - `serverMarkdownContext`
- Core:
  - Uses:
    - `page/editor.Block`
    - `page/editor.BlockFieldChanges`
    - `page/editor.BlockHandle`
    - `page/editor.BlockPatch`
    - `page/editor.BlockUpdate`
    - `page/editor.coalesce`
    - `page/editor.dataEqual`
    - `page/editor.IdentifiedBlock`
    - `page/editor.MarkdownContext`
    - `page/editor.MarkdownNode`
    - `page/editor.markdownParseTagName`
    - `page/editor.markdownTagIsIdentified`
    - `page/editor.namesField`
    - `page/editor.PAGE_BLOCK_TYPE`
    - `page/editor.pageBlockMarkdown`
    - `page/editor.plainOf`
    - `page/editor.RichText`
    - `page/editor.runsOf`
    - `page/editor.SerializedBlock`
    - `page/editor.serializeForestToMarkdown`
    - `page/editor.serializeInlineMarkdown`
    - `page/editor.withMintedIds`
    - `primitives/rank.Rank`
  - Exports (types):
    - `BoundaryViolation`
    - `MarkdownApplyArgs`
    - `MarkdownApplyPlan`
    - `MarkdownApplyResult`
    - `MarkdownTextEdit`
    - `StoredRow`
    - `TouchedBlocks`
    - `TouchedHow`
  - Exports (values):
    - `boundaryViolations`
    - `documentOrderRows`
    - `markdownNodesOfRows`
    - `pageTitleBanner`
    - `planMarkdownApply`
    - `stripPageTitleBanner`
    - `touchedBlocks`
- Cross-plugin:
  - Imported by: `page/annotations/agent-access`

<!-- AUTOGENERATED:END -->
