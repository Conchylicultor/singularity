# agent-access

The **agent-facing surface of a page**: three MCP tools over
[`page/markdown-apply`](../../../markdown-apply/CLAUDE.md)'s engine, shaped as
the file triple an agent already knows.

```
read_page(block_id)                              → subtree markdown; human-audience subtrees pruned,
                                                   `# Title` and `<agent-note id="…">` emitted
write_agent_note(block_id, content)              → merge-apply ONE card's contents
edit_page(block_id, old_string, new_string, …)   → ANY block; legality is what the diff TOUCHED
```

It lives under `annotations` because it is the filter over THIS family: both
"withhold `/private`" and "own `<agent-note>`" are statements about the
audience-scoped family, not about markdown. The engine stays audience-agnostic —
it takes a root, a row filter and a boundary predicate, and never learns what an
audience is.

`read_page`'s ids are what make the triple compose. A file path exists before you
read the file; a block id did not, so `read_page` + a write tool used to be two
tools with no shared vocabulary — the only anchor an agent could name was the
page root it started from. Emitting `<agent-note id="…">` (and `<page id="…"/>`)
gives the read an output the write tools take as input, which is the whole reason
the two sections below reverse what they reverse. Design:
[`research/2026-08-07-page-agent-note-file-like-tools.md`](../../../../../../research/2026-08-07-page-agent-note-file-like-tools.md).

## Addressing is NO LONGER the authorization — for WRITES. Deliberately

> **This section reverses a recorded decision.** It used to read: *"Writes are
> not restricted by validating the patch they produce. They are restricted by
> what an agent can **name**."* That rule is gone, on purpose, and restoring it
> would remove the feature rather than harden it. Read the rest of this section
> before reaching for it again.

**What the old rule was.** A write tool accepted only a block whose type is
`agent-note`, and the engine was scoped to that block's subtree. An agent could
not rewrite a paragraph because no tool took a paragraph's id. Structural, cheap
to state, and impossible to get wrong.

**Why it went.** It also made the thing this surface exists for impossible. An
agent asked to annotate *a specific line* could not: a line's id was not
something any tool accepted, and `read_page` did not emit one anyway. The only
route to a line was `query_db` — a documented *debugging* tool — as a workflow
dependency. The rule was not buying safety at the margin; it was buying it by
removing the feature.

**What replaced it.** `edit_page` takes **any** block id, up to and including the
page's own. The id is only the SCOPE the edit is applied at. Legality is decided
afterwards, on the plan:

> Every block an edit creates, rewrites, moves or deletes must sit inside an
> `<agent-note>` card — checked on **BOTH** the block's old and its new ancestry
> for anything that survived, so an edit cannot drag the page's prose into a card.

**Why that is still safe, and in three ways stronger than what it replaced.**

- **The judgement runs on the PLAN, not on the incoming forest.** A plan sees a
  retyped survivor, a moved row and a deletion as themselves; a walk over the
  parsed markdown saw all three as "a node I cannot distinguish from a create".
  So the two invariants that used to live over the forest — *nothing may mint a
  human-audience card*, *notes do not nest* — moved onto the plan and got
  stronger in the move (`assertNotesOnlyPlan`, rules 1 and 2).
- **Both chains, not just the new one.** Re-indenting the page's prose under an
  existing card is a MOVE, and because the aligner preserves the id of
  byte-identical text it arrives as an `update` naming `parentId` — not a create.
  An after-only test would accept it, and the whole page could be annexed into
  the agent's dashed box, attributed to the agent, without a character being
  deleted. Updated/text-edited blocks are therefore judged on their OLD chain as
  well (`escaped-origin`), resolved against pre-plan maps so moving an ancestor
  in the same plan cannot launder a block through it.
- **It runs strictly before the first write.** `assertAcceptable` is called
  synchronously after planning and before `applyPageBlockPatch`, so a refusal has
  provably written nothing — and the plan it judged is the one that would have
  been committed, not a second read of the rows.

**Addressing is still the authorization for READS**, and that half did not move:
`assertAgentAddressable` refuses a block that IS, or sits inside, a
human-audience card, and `edit_page` goes through that same door on its way in —
it reads the scope as markdown before it edits it. What changed is only the
verdict on the way out.

**The residual bound, stated rather than hidden:** an edit whose diff stays
inside a card may rewrite that card wholesale, including anything a HUMAN typed
into it. That was already true of `write_agent_note`, and it is what an
agent-note card is for.

### Redaction is no longer a read-only concern either

The old rule's corollary was that redaction never had to touch the write path:
strip a private card on read, and a write diffing the edited document against the
FULL stored forest reads every stripped card as a deletion — so the write scope
simply never contained redacted content, because a private card cannot live
inside an agent-note card.

A page-rooted `edit_page` blows that up: the scope now IS the page, so it
contains every private card on it. The answer is not a second filter but the
**same** one, run on both halves: `redactHumanAudience` is `ReadBlockOptions.redact`
and `ApplyBlockOptions.redact`, so a write diffs against exactly the document the
read produced. A card the agent never saw is invisible to the walk and preserved
by it — the engine keeps its `(parent_id, rank)` key reserved, and a `ref` naming
it answers `ref-out-of-scope` rather than `unknown-ref`, so an id copied from
somewhere else cannot drag it into scope. See *Ranks are minimal* and *Asserted
identity: pins* in the engine's doc; the invariant this plugin depends on is that
**one function serves both directions**, generic in its row type precisely so a
second, differently-typed copy cannot drift.

The four rules are stated once, in `server/internal/policy.ts`. All of them
enumerate the family generically off `Editor.BlockData` (`audience === "human"`)
and never name a type, so a fifth annotation costs this plugin zero edits. The
set is read at CALL time: a snapshot taken before `collectContributions` degrades
to "redact nothing" — and now also to "an agent may mint a private card" — and
that failure is silent and unrecoverable.

## `write_page` / `edit_page` came BACK — the other reversal

> **This section reverses a recorded decision.** It used to read: *"Whole-page
> markdown editing shipped with the engine and is deliberately removed: no
> agent-reachable tool writes a page's prose."*

`edit_page` exists again, and it is emphatically **not** the tool that was
removed. The one that went away wrote a page's prose: hand it a document and the
page became that document. The one that came back cannot touch prose at all —
the acceptance predicate above refuses every block it creates, rewrites, moves or
deletes that does not sit inside an `<agent-note>` card. The scope widened from
"one card's subtree" to "any root"; the WRITE surface did not widen at all. Same
name, and the name is now about where the edit is anchored rather than what it
may author.

`write_page` did **not** come back, and the omission is the design: a
whole-document overwrite has no diff to judge, so the predicate it would have to
pass is one it cannot express. Every write is localized, and the closest thing to
a whole-document write is `write_agent_note`, whose scope is one card by
construction. The noun in `write_agent_note`'s name is also its own first error
message — the primary mistake is passing a page id, and the name pre-empts it.

## The `append` trade: `assertNotesOnlyPlan` is what a creates-only patch was

`append_agent_notes` is deleted. It never went through the planner: it built the
patch directly — one create for the card, one per parsed child, ranked after the
target's last child — and its argument for being safe was structural and, at the
time, unanswerable:

> **Creates-only is structurally incapable of touching anything else**, which a
> diff-based append would need a guard to promise.

That is exactly the trade this rework made, and it is recorded here rather than
deleted with the file. The guard now exists — `assertNotesOnlyPlan` — so the
promise is made by a predicate over a plan instead of by the shape of a patch.
What was bought:

- **One dialect, one path.** Append parsed with the engine's own
  `serverMarkdownContext()` but planned with nothing, so "what an agent writes"
  and "what an agent reads back" agreed only for as long as two code paths
  agreed. A tagless `<agent-note>` in an ordinary `edit_page` document is now how
  a card is minted, through the same planner as every other write.
- **The `blockId`-vs-`noteId` split dissolves.** Three tools, one parameter name
  (`block_id`), because there is no longer a tool whose id means "the parent to
  append under" as opposed to "the thing to write".
- **Creation is judged, not privileged.** A creates-only patch could mint a card
  anywhere, including inside a `/private` one; the plan-level rules refuse that
  (and a nested card, and a minted `private-note`) uniformly, wherever the create
  came from.

What was paid: the promise is now a predicate, and a predicate can have a bug
where a shape cannot. That is why the acceptance rules are stated once, tested
directly (`server/internal/policy.test.ts`), and asserted end-to-end against the
five-column row snapshot in `e2e/agent-access-verify.ts` — the tool's own report
is not proof that a refusal wrote nothing.

Concurrency changed shape with it: two appends from the same floor collided at
the `(parent_id, rank)` unique index. Two concurrent `edit_page`s cannot — each
plans its ranks against the forest it read under the page lock — but they can
lose an update, the second simply not seeing the first's card.

## Authorship is stamped per card, after the commit

An edit may mint and revise several cards, so `assertNotesOnlyPlan` returns **the
card set** it resolved — the same walk, one answer — and the tool layer stamps
each one. Always AFTER the patch commits: `page_blocks_agent_authors.block_id`
FKs onto the card's row, so stamping a card the same call just created is a
foreign-key violation until then. `recordAgentNotesAuthor` is
`onConflictDoNothing`, so re-stamping is free.

`write_agent_note` also stamps its target card when the diff was empty — "I wrote
this card" is true either way. `edit_page` stamps nothing in that case: it names
no card of its own, so an edit that touched none has no authorship to claim. The
tool layer is the only place a `conversationId` exists at all; neither the engine
nor the policy ever learns one.

## Stated bounds

- **Absence is visible.** A read shows a gap where a private card was — no
  marker, by choice — so an agent may re-derive something the author already
  noted privately. `read_page`'s description says so, which is the mitigation.
- **A human's edits inside a notes card can be overwritten** by the next
  `write_agent_note`. Write semantics; `edit_page` is the mitigation, and its
  description says to prefer it.
- **A card is minted where the tagless tag sits, not where a hidden row does.**
  Blocks inserted where a redacted row sits land AFTER it, contiguously — the
  engine's rank rule (`planSiblingRanks`' `reserved`), inherited here because
  this plugin is what makes the write redact in the first place.
- `read_page` loads the scope twice (once to decide about the id, once inside the
  engine to serialize it). Deliberate: the policy question must be answered
  before the id is handed over as a root. The WRITE path no longer double-reads —
  one `BlockScope` is loaded, serialized for the agent and diffed against, which
  is what makes "a write diffs against the document the agent saw" literally
  true rather than probably true.
- **The `# Title` banner is not writable**, and `edit_page` refuses an edit that
  changes the document's first line with a message naming the title rather than
  letting it fall through to the planner as a created heading. Diagnosis, not
  authority: the planner would refuse it anyway.

Design: [`research/2026-08-07-page-agent-note-file-like-tools.md`](../../../../../../research/2026-08-07-page-agent-note-file-like-tools.md)
(supersedes [`research/2026-08-05-page-agent-notes-mcp-access.md`](../../../../../../research/2026-08-05-page-agent-notes-mcp-access.md),
which is where the two reversed decisions were made).
Spec: `e2e/agent-access-verify.ts`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The agent-facing tool surface over a page, as the file triple: read_page (human-audience subtrees pruned), write_agent_note (one card's contents) and edit_page (any block, judged by what the diff touched — every write must land inside an <agent-note> card). The policy over page/markdown-apply's audience-agnostic engine.
- Server:
  - Uses:
    - `infra/endpoints.HttpError`
    - `infra/mcp.Mcp`
    - `page/annotations/agent-notes/authorship.recordAgentNotesAuthor`
    - `page/editor.Editor`
    - `page/editor.StoredBlock`
    - `page/markdown-apply.applyMarkdownToBlock`
    - `page/markdown-apply.ApplyReport`
    - `page/markdown-apply.loadBlockScope`
    - `page/markdown-apply.readBlockAsMarkdown`
    - `page/markdown-apply.serverMarkdownContext`
  - Register:
    - `mcpTool('read_page')`
    - `mcpTool('write_agent_note')`
    - `mcpTool('edit_page')`

<!-- AUTOGENERATED:END -->
