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
- **`redact` is a row filter applied BEFORE the walk**, so pruning a row prunes
  its subtree for free. The engine never learns what a redaction *is* —
  audience/policy lives with the caller.
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

## Sub-pages are pinned, and never deleted

A shell owns an entire other `page_id` partition. Its identity is its ROW ID,
which `<page id="…"/>` carries and no `data` field does — and the engine reads
that id back **by serializing the incoming pointer node and comparing the line**,
never by naming a block type or a `data` field. The tag is the contract; the
serializer is the only thing that knows how a type encodes its identity into one.

- A pin is settled in a pass of its own, AFTER the content passes and
  unconditionally. An exact-key LCS drops a match whose order crossed, and a
  shell that merely moved must not thereby become "delete this page".
- A shell **absent** from the incoming markdown is preserved, re-homed to the top
  level after everything the document did place (the `replacePageContent`
  rank-floor idiom). It stays exactly put only when it already sits above that
  floor. Anywhere else it moves, because its own sibling list was re-ranked
  without it and the only interval provably free of a `(parent_id, rank)`
  collision is above the floor. Under a **nested root** this is
  `subpage-removed` instead — see *The root is the scope* above.
- **`unknown-page-ref`** — a `<page id="…"/>` that is neither a live sub-page of
  this page nor a reference this document ALREADY holds. The second half of that
  rule is not a softening: `<page id="…"/>` is also how an ordinary
  link-to-page block serializes, so refusing every id that is not a sub-page
  would break every such block on every apply. What is refused is *inventing* a
  page reference, which a pure planner cannot verify.
- **`subpage-reparented`** — one shell referenced twice. (The plan named this
  reason for a repositioned shell; repositioning within a page is legal and
  supported, so the name is bound to the one placement that is genuinely
  impossible: one row cannot occupy two positions.)

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

## `StoredRow` is a local structural type

`page/editor`'s `StoredBlock` lives behind its SERVER barrel, which a `core`
module may not import. `core/stored-row.ts` declares the five columns this
engine reads; the server-side caller passes `StoredBlock[]` straight in and tsc
proves the two agree at that one call site.

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

`read_page` moved to
[`page/annotations/agent-access`](../annotations/plugins/agent-access/CLAUDE.md)
with the notes-only writers; `write_page` / `edit_page` are **gone** — no agent
reaches a page's prose any more. The split is not filing: `append_agent_notes`
names a concrete block type, which a generic engine must not, and the redaction
predicate is POLICY, not projection. What is left takes a root and a row filter
and never learns what an audience is, so a second policy (export, share link)
reuses it without adding a branch here.

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
    - `page/editor.PAGE_BLOCK_TYPE`
    - `page/editor.pageBlockMarkdown`
    - `page/editor.plainOf`
    - `page/editor.RichText`
    - `page/editor.runsOf`
    - `page/editor.SerializedBlock`
    - `page/editor.serializeForestToMarkdown`
    - `page/editor.withMintedIds`
    - `primitives/rank.Rank`
  - Exports (types):
    - `MarkdownApplyArgs`
    - `MarkdownApplyPlan`
    - `MarkdownApplyResult`
    - `MarkdownTextEdit`
    - `StoredRow`
  - Exports (values):
    - `documentOrderRows`
    - `markdownNodesOfRows`
    - `planMarkdownApply`
- Cross-plugin:
  - Imported by: `page/annotations/agent-access`

<!-- AUTOGENERATED:END -->
