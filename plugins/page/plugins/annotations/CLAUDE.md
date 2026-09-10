# annotations

The page's **side-channel between a human and the agents working on it**, as
block types. An annotation is a [void container](../container/CLAUDE.md) — it owns
no text; its content IS its children — whose soft tint says *this run of blocks
is not the page's prose, it is addressed to (or withheld from) an agent*.

Four of them, and the family is a two-axis matrix rather than a list: each card
declares who may RECEIVE it (`audience`) and whose words it holds (`author`),
and the second answer is also who may WRITE it.

| Block | `audience` | `author` | Means |
|---|---|---|---|
| `/human` | `agent` | `human` | The page author's own words for an agent: conventions, glossary, "always run X first", or a correction typed into an agent's own note. Aliases `/context`, `/user`. |
| `/todo` | `agent` | `human` | Work an agent still has to do. Also minted by typing `TODO ` at the start of a line. |
| `/agent` | `agent` | **`agent`** | Notes an agent wrote back: what it found, what it assumed, what it left. |
| `/private` | `human` | `human` | Withheld from agents. The one block whose contents an agent must never receive. |

**`/agent` is the only agent-authored card in the system.** That single cell is
what the whole agent-write rule reduces to — there is no list of writable types
anywhere, just one block declaring `author: "agent"` and a walk that asks.

They are siblings under one umbrella rather than four entries in the flat
`page/plugins/` list because a consumer of this family always wants the SET — the
delivery step below has to ask "which annotations does this page carry, and who
is each one for?", never "is there a human card?".

## Both parties are declared, and one consumer reads each

**Declared.** `core/define-annotation-block.ts` — `defineAnnotationBlock` is
`defineContainerBlock` plus two REQUIRED fields, `audience` and `author`, landing
on `BlockHandle`. They are genuinely separate questions: `/human` and `/todo` are
addressed to an agent and are still not an agent's to rewrite.

- **They ride the handle**, already what `Editor.BlockData.getContributions()`
  gives the server — so both consumers read the registry they already read, with
  no second registry to drift. Both filter generically (`audience === "human"`,
  `author === "agent"`), never by type name, so a fifth annotation costs the
  delivery and write paths zero edits.
- **Unmarked is unrepresentable here, not defaulted.** Outside this family the
  absent values are what an ordinary paragraph means, and they point in opposite
  directions — absent `audience` is *visible to everyone* (a paragraph is
  withheld from nobody), absent `author` is *the human's* (the page's prose is
  not an agent's to rewrite). Both are the fail-safe reading of their own axis,
  which is why an annotation must state them rather than fall through.
- **`./singularity check annotations:parties-declared`** fails a block type under
  this umbrella that reached for `defineContainerBlock` directly, which would
  make it an ordinary paragraph on both axes — agent-visible and, worse for a
  card an agent is meant to own, silently unwritable. Presence of the fields is
  the discriminator; nothing else can set them.

**Read** by exactly one consumer:
[`plugins/agent-access`](plugins/agent-access/CLAUDE.md), which prunes `human`
subtrees out of the agent-facing `read_page` — and out of the WRITE's walk
through the same filter — and confines every write to a region an agent authors.
That confinement is judged on the PLAN a write produces, not on which id opened
it: `edit_page` accepts any block, including the page itself.
`/private` is a real channel there and nowhere else — a `/prompt` launch still
sends only that block's own text, and no other surface filters.

### The write rule: the nearest declaring ancestor wins

For every block a write touches, the walk goes up from the block itself and stops
at the **first row that declares an `author` at all** — not at the first row that
says yes. So:

- inside an `<agent-note>`: writable, because the nearest declaration is
  `author: "agent"`;
- inside a `<human>` or `<todo>` card **nested in that `<agent-note>`**: refused.
  The nested card declares `human` first, and it is a hole in the agent's own
  card. This is what makes answering an agent inside its own note survive the
  next `write_agent_note`;
- anywhere else on the page: refused, because nothing declares and absent means
  the human's. The page's own prose is read-only to an agent for exactly that
  reason — not because a rule enumerates prose, but because prose declares
  nothing.

Minting counts as writing at the new card's own row, so an agent cannot create a
`<human>`, `<todo>` or `<private-note>` anywhere, including inside its own card.
Filing work is `add_task`.

**The markdown serializer keeps emitting private children**, deliberately: it
runs for the CLIPBOARD, and a human copying their own page must get their own
notes. Redaction is the agent-facing consumer's job, never a serializer's, which
would silently eat text on Cmd+C.

## What every annotation shares, and what stays per-block

Shared, and NOT re-derived per plugin: the whole void-container shape —
`anchor` / `wrapOnConvert` forced, plus `ContainerNoRow`, `ContainerBackdrop` and
`ContainerCornerLabel`. The mechanism lives in
[`page/container`](../container/CLAUDE.md); an annotation plugin adds none of its
own. It reaches it through this umbrella's `defineAnnotationBlock`, never
`defineContainerBlock` directly — that is the two declarations above, and the
check enforces it.

**No annotation has per-instance appearance** — every payload is `z.object({})`,
and must stay so. The structural actions (Collapse / Remove `<label>` / Delete)
are never contributed either: they come from the rail on the line the card
BORROWS, whose menu arm keys on the core `BlockHandle.anchor` fact.

Two of the four still put something behind their NAME, and neither breaks that
rule, because what they show is per-instance STATE held in a side-table keyed on
the block id — not per-instance *data*:

- **`agent-note`** passes `sections`: the card's PROVENANCE, which conversations
  wrote into it. See
  [`agent-notes/plugins/authorship`](plugins/agent-notes/plugins/authorship/CLAUDE.md).
  With no authors it falls back to the plain inert mark.
- **`todo`** passes `sections` AND a `BlockFrameMeta.menu` — the same dispatch
  panel in both places, per the container convention. It is the one annotation
  with an ACTION rather than a read, so its name is a trigger even before there
  is state behind it, and the one that declares an `action`: point at the word
  `TODO` and it becomes `▷ LAUNCH`, in place. It is also the only container in
  the repo with a `BlockFrameMeta.foot` — the runs it has launched, as chips at
  the bottom of its box. See
  [`todo/plugins/task-link`](plugins/todo/plugins/task-link/CLAUDE.md).

`human` and `private-note` pass a bare name — plain and non-interactive on both
surfaces.

Per-block, and deliberately: its identity (`type`, label, aliases), its
tint, and its markdown marker. Those are four separate `Editor.Block` /
`Editor.BlockFrame` registrations rather than one parameterized helper, for the
reason `page/container` already records — containerhood is derived from *who
actually paints a box*, so a registration made on a plugin's behalf would move
that fact one indirection away from the plugin it describes.

A block's stored `type` is not always its spelling: `human-notes` stores
`context` and tags `<human>`, `agent-notes` stores the singular `agent-note`.
`BlockTag.name` exists so a tag may differ from a type, and a type is what page
rows and the `Editor.Block` contribution id (hence users' persisted reorder
directives) are keyed by — so renaming a card is a rename of everything except
that. Each block file argues its own case.

### The family is NAMED, where a callout is DRAWN

That sentence replaced the old family signature, which was a **dashed border**.
Dashes, a permanent icon in the margin and a hue were three marks doing one job,
and a page carrying three cards read as a stack of widgets rather than as a
document with asides. What is left is:

- a **soft tint and nothing else** at rest — no border, no icon;
- the card's **own name**, in the box's top-right corner, appearing only while
  the pointer is inside it (`cornerAnchor`, the corner decoration seat — see
  [`page/container`](../container/CLAUDE.md));
- and, for `/todo`, that name doubling as the launch control.

A **callout** is the inverse and that is now the whole distinction: it keeps a
gutter glyph (`anchor`), because its icon is one its author CHOSE and is part of
what the card says, and it carries no name because the icon already answers.
An annotation has no mark of its own to show, so it says what it is in words,
and only when asked.

The icons did not disappear — `MdPerson`, `MdPendingActions`, `MdAutoAwesome` and
`MdVisibilityOff` still name their cards in the slash menu and the turn-into
list, off the handle. They just left the card, where they were charging every
instance a fixed price for a fact the tint already carries.

Within the family the hue carries the direction, over the shared semantic tokens
(never raw colors, so a preset switch restyles them for free):

- `human` — neutral `muted`: the page's own voice, the background against which
  the agent works. Neutral because every other semantic hue here carries a
  status, and this card has none; it also has to stay legible nested inside
  `agent-note`'s `info`, which the write rule makes an ordinary arrangement.
- `agent-note` — `info`: something an agent is telling you.
- `todo` — `warning`: outstanding work. The one hue that is not fixed: a card
  whose dispatched task is `done` repaints `success` and a `dropped` one fades to
  `muted`, so a finished TODO stops shouting without leaving the page.
- `private-note` — `destructive` at low alpha: restricted, not an error. The
  NAME carries the meaning; the tint only flags it. It is the one card whose name
  genuinely tells the reader something the hue cannot, which is the argument for
  a word over an icon rather than against showing anything at all.

The alphas lifted a step when the borders went: with no edge to hold it together
a `/5` wash read as a smudge rather than as a box.

**No card keeps its name at rest**, `/todo` included. It used to: a dispatched
card stopped hiding and spelled the task's live status there, because the tint
cannot — an open card and one being worked on are both `warning`. `/todo` now has
a FOOT for that (`BlockFrameMeta.foot`, see
[`todo`](plugins/todo/CLAUDE.md)), so the name is back to being worth nothing at
rest. Don't reinstate it: two renderings of one status drift.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Umbrella for the page editor's annotation containers — the party-scoped boxes that carry the human↔agent side-channel of a page: human notes, agent notes, private notes, TODO.
- Core:
  - Uses:
    - `page/container.ContainerBlockOptions`
    - `page/container.defineContainerBlock`
    - `page/container.RejectTextBearing`
  - Exports (types):
    - `AnnotationBlockHandle`
    - `AnnotationBlockOptions`
  - Exports (values): `defineAnnotationBlock`
- Cross-plugin:
  - Imported by:
    - `page/annotations/agent-notes`
    - `page/annotations/human-notes`
    - `page/annotations/private-notes`
    - `page/annotations/todo`
- Sub-plugins:
  - **`agent-access`** — The agent-facing tool surface over a page, as the file triple: read_page (human-audience subtrees pruned), write_agent_note (one card's contents) and edit_page (any block, judged by what the diff touched — every write must resolve inside a region an agent authors, so an <agent-note> card admits it and a <human> or <todo> card nested there refuses it). The policy over page/markdown-apply's audience-and-author-agnostic engine.
  - **`agent-notes`** — Agent-notes block type: a void CONTAINER whose soft-tinted box wraps blocks of any type nested inside it, holding what an agent wrote back to the page's author. Agent-notes block type: registers its (empty) `data` schema at the server write boundary, rejecting stray keys like an injected `text`.
  - **`human-notes`** — Human block type: a void CONTAINER whose soft-tinted box wraps blocks of any type nested inside it, holding the page author's own words addressed to agents rather than to the reader — and, being the author's, the one an agent may read but never write. Human block type: registers its (empty) `data` schema at the server write boundary, rejecting stray keys like an injected `text`.
  - **`private-notes`** — Private-note block type: a void CONTAINER whose soft-tinted box wraps blocks of any type nested inside it, holding notes withheld from agents. Private-note block type: registers its (empty) `data` schema at the server write boundary, rejecting stray keys like an injected `text`.
  - **`todo`** — TODO block type: a void CONTAINER whose soft-tinted box wraps blocks of any type nested inside it, marking a region of work agents still have to do. Also minted by typing `TODO ` at the start of a line. Its corner name and its rail menu open the dispatch panel, its box follows the dispatched task's live status, and its foot carries a chip per run the card has launched. TODO block type: registers its (empty) `data` schema at the server write boundary, rejecting stray keys like an injected `text`.

<!-- AUTOGENERATED:END -->
