# agent-access

The **agent-facing surface of a page**: three MCP tools over
[`page/markdown-apply`](../../../markdown-apply/CLAUDE.md)'s engine, shaped as
the file triple an agent already knows.

```
read_page(block_id)                              → subtree markdown; human-audience subtrees pruned,
                                                   `# Title`, `<agent-note id="…">` and `<human id="…">` emitted
write_agent_note(block_id, content)              → merge-apply ONE card's contents
edit_page(block_id, old_string, new_string, …)   → ANY block; legality is what the diff TOUCHED
```

It lives under `annotations` because it is the filter over THIS family: "withhold
`/private`", "own `<agent-note>`" and "leave `<human>` alone" are all statements
about the two-axis family, not about markdown. The engine stays agnostic — it
takes a root, a row filter and a row classifier, and never learns what an
audience or an author is.

`read_page`'s ids are what make the triple compose. A file path exists before you
read the file; a block id did not, so `read_page` + a write tool used to be two
tools with no shared vocabulary — the only anchor an agent could name was the
page root it started from. Emitting `<agent-note id="…">` (and `<page id="…"/>`)
gives the read an output the write tools take as input, which is the whole reason
the two sections below reverse what they reverse. Design:
[`research/2026-08-07-page-agent-note-file-like-tools.md`](../../../../../../research/2026-08-07-page-agent-note-file-like-tools.md).

## The database is the SHARED one, and that is the point

These tools touch `db` directly, and the MCP server runs in the instance that
**launched** the conversation (`.mcp.json` dials `SINGULARITY_PARENT_HOST`) —
normally main. So a page write lands in main's store, never the agent's fork.

Intended: pages are **prod documents an agent edits collaboratively with the
user**, not fixtures to test on. A worktree-local copy would be one nobody reads.
`query_db` defaults the other way (the agent's own fork) because it inspects what
the agent is building — same server, opposite default, which is why all three
descriptions open by saying so.

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
> `<agent-note>` card, and not inside a `<human>` or `<todo>` card within it —
> checked on **BOTH** the block's old and its new ancestry for anything that
> survived, so an edit cannot drag the page's prose into a card, nor carry a line
> out of one the author wrote.

**Why that is still safe, and in three ways stronger than what it replaced.**

- **The judgement runs on the PLAN, not on the incoming forest.** A plan sees a
  retyped survivor, a moved row and a deletion as themselves; a walk over the
  parsed markdown saw all three as "a node I cannot distinguish from a create".
  So the two invariants that used to live over the forest — *nothing may mint a
  human-audience card*, *notes do not nest* — moved onto the plan and got
  stronger in the move. **Neither survives as a rule of its own, and each went
  for its own reason.** Minting is a write at the new card's own row, so the
  `author` walk refuses it with nothing to keep in step; nesting was refusing a
  shape the rest of the system handles, so it was dropped outright (see **A card
  inside a card** below). What is left is one walk.
- **Both chains, not just the new one.** Re-indenting the page's prose under an
  existing card is a MOVE, and because the aligner preserves the id of
  byte-identical text it arrives as an `update` naming `parentId` — not a create.
  An after-only test would accept it, and the whole page could be annexed into
  the agent's own card, attributed to the agent, without a character being
  deleted. Updated/text-edited blocks are therefore judged on their OLD chain as
  well (`side: "old"`), resolved against pre-plan maps so moving an ancestor
  in the same plan cannot launder a block through it. The same two chains carry
  the closed answer for free: writing INSIDE a `<human>` card fails on the new
  side, carrying a block OUT of one fails on the old.
- **It runs strictly before the first write.** `assertAcceptable` is called
  synchronously after planning and before `applyPageBlockPatch`, so a refusal has
  provably written nothing — and the plan it judged is the one that would have
  been committed, not a second read of the rows.

**Addressing is still the authorization for READS**, and that half did not move:
`assertAgentAddressable` refuses a block that IS, or sits inside, a
human-audience card, and `edit_page` goes through that same door on its way in —
it reads the scope as markdown before it edits it. What changed is only the
verdict on the way out.

### The residual bound is CLOSED: a card the human wrote is a hole in the agent's

> **This section reverses a recorded bound.** It used to read: *an edit whose
> diff stays inside a card may rewrite that card wholesale, including anything a
> HUMAN typed into it.* So there was no way to answer an agent inside its own
> note and have the answer survive the next `write_agent_note`.

Every annotation declares `author` as well as `audience`, and the write rule is
**the nearest declaring ancestor wins**: `writeBoundaryOf()` maps
`author: "agent"` → `"open"`, `author: "human"` → `"closed"`, everything else →
`undefined`, and the engine's walk stops at the first row that declares
ANYTHING — not the first that says yes. So a `<human>` or `<todo>` card nested
inside an `<agent-note>` shields its own contents, an `<agent-note>` a human
nested inside a `<human>` card still admits writes, and prose is refused because
nothing on its chain ever declared. **A declaring row is inside itself**, so
minting a `<human>`, `<todo>` or `<private-note>` anywhere — including inside the
agent's own card — is refused by that same walk, at the new row.

That last point is why one invariant disappeared rather than moved: *nothing may
mint a human-audience card* was a separate walk over the plan's creates and
retypes, and it is now the same walk with the same evidence. Two invariants that
could drift out of step became one that cannot.

`writeBoundaryOf()` is read at CALL time like `humanAudienceTypes()`, and the
**degradation direction inverts**: an empty registry means nothing is open, i.e.
every write is refused — loud, where the same degradation for `audience` would
have meant "redact nothing".

What is left of the bound, narrower: **plain text a human typed LOOSE in a notes
card is still the agent's to rewrite** — it declares nothing, so the nearest
declaration above it is the card's own `author: "agent"`. The affordance, not a
workaround, is to put the answer in a `<human>` card.

### A card inside a card

An `<agent-note>` nested in another one used to be refused outright. That rule
came from `append_agent_notes`, where a card id was the append TARGET and nesting
was a caller mistake with no meaning; when that tool died it was carried across
onto the plan rather than reconsidered.

It is gone, because it refused a shape the rest of the system already handles.
The markdown tag scanner counts nested opens of its own name
(`editor/core/markdown.ts`), the editor imposes no child-type restriction — a
human can nest two cards by hand today, and an agent may already nest a `todo` or
`context` card in one — and `ContainerBackdrop` reserves a nesting pad so an inner
card starts one pad below its parent's edge, its wash composing over the outer
one, which is the cue that it IS a separate card. The boundary judgement reads a
nested card as inside a card, because it is one.

Two consequences, stated rather than discovered:

- **`write_agent_note` no longer catches the wrapping mistake.** Its `content` is
  the card's CONTENTS; an agent that wraps it in an `<agent-note>` tag anyway now
  mints a card inside the card it was writing. The tool's description says that,
  rather than promising an error it no longer raises.
- **Authorship stamps the NEAREST card.** A write inside a nested card marks that
  card as this conversation's work; the card holding it is not marked.

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

The three rules are stated once, in `server/internal/policy.ts`, one per declared
fact plus the door between them: **`audience`** decides what an agent may SEE
(redaction + `assertAgentAddressable`), `assertNoteCard` is `write_agent_note`'s
door, and **`author`** decides what it may WRITE (`assertNotesOnlyPlan`). All of
them enumerate the family generically off `Editor.BlockData` and never name a
type — `agent-note` excepted, which the door is about — so a fifth annotation
costs this plugin zero edits. Both sets are read at CALL time; see the inverted
degradation above.

## `write_page` / `edit_page` came BACK — the other reversal

> **This section reverses a recorded decision.** It used to read: *"Whole-page
> markdown editing shipped with the engine and is deliberately removed: no
> agent-reachable tool writes a page's prose."*

`edit_page` exists again, and it is emphatically **not** the tool that was
removed. The one that went away wrote a page's prose: hand it a document and the
page became that document. The one that came back cannot touch prose at all —
the acceptance predicate above refuses every block it creates, rewrites, moves or
deletes that does not resolve inside a region an agent authors. The scope widened from
"one card's subtree" to "any root"; the WRITE surface did not widen at all. Same
name, and the name is now about where the edit is anchored rather than what it
may author.

`write_page` did **not** come back, and the omission is the design: a
whole-document overwrite has no diff to judge, so the predicate it would have to
pass is one it cannot express. Every write is localized, and the closest thing to
a whole-document write is `write_agent_note`, whose scope is one card by
construction. The noun in `write_agent_note`'s name is also its own first error
message — the primary mistake is passing a page id, and the name pre-empts it.

### `edit_page` hands the engine the document it edited

`edit_page` reads the scope, splices one string, and applies the whole document —
so every block it did not touch still round-trips through markdown → forest, and
any loss in that projection would reach `assertNotesOnlyPlan` as a write outside
every card. It therefore passes the pre-splice document as
`ApplyBlockOptions.baseline`, and the engine subtracts the writes that document
would produce by itself before the predicate judges anything (the engine's own
[`subtract-noise`](../../../markdown-apply/CLAUDE.md) section). The rule the tool
enforces is unchanged; what changed is that it is now enforced against the
caller's edit rather than against the round trip.

`write_agent_note` composes its document rather than editing one, so it passes no
baseline — there is nothing to subtract, and its apply is rooted at one card
anyway.

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
  (and a minted `private-note`) uniformly, wherever the create came from.

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
- **Plain text a human typed loose in a notes card can be overwritten** by the
  next `write_agent_note` — it declares no `author`, so the nearest declaration
  is the card's own. A `<human>` card nested there cannot be: that is the
  affordance to point them at, not `edit_page`. `write_agent_note` composes the
  card's WHOLE contents, so omitting such a card plans its deletion and the whole
  write is refused with nothing written; its description says to echo it back.
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

- Description: The agent-facing tool surface over a page, as the file triple: read_page (human-audience subtrees pruned), write_agent_note (one card's contents) and edit_page (any block, judged by what the diff touched — every write must resolve inside a region an agent authors, so an <agent-note> card admits it and a <human> or <todo> card nested there refuses it). The policy over page/markdown-apply's audience-and-author-agnostic engine.
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
