# annotations

The page's **side-channel between a human and the agents working on it**, as
block types. An annotation is a [void container](../container/CLAUDE.md) — it owns
no text; its content IS its children — whose soft tint says *this run of blocks
is not the page's prose, it is addressed to (or withheld from) an agent*.

Four of them, and the family is exactly the four directions that channel has:

| Block | Direction | Means |
|---|---|---|
| `/context` | human → agent, standing | Instructions that hold for the whole page: conventions, glossary, "always run X first". |
| `/todo` | human → agent, actionable | Work an agent still has to do. Also minted by typing `TODO ` at the start of a line. |
| `/agent` | agent → human | Notes an agent wrote back: what it found, what it assumed, what it left. |
| `/private` | human only | Withheld from agents. The one block whose contents an agent must never receive. |

They are siblings under one umbrella rather than four entries in the flat
`page/plugins/` list because a consumer of this family always wants the SET — the
delivery step below has to ask "which annotations does this page carry, and who
is each one for?", never "is there a context card?".

## The audience is declared, and one consumer reads it

**Declared.** `core/define-annotation-block.ts` — `defineAnnotationBlock` is
`defineContainerBlock` plus one REQUIRED field, `audience`, landing on
`BlockHandle.audience`: `human` for `/private`, `agent` for the other three
(including `/agent` — the field answers *may an agent receive this*, not *who is
the reader*, and an agent must be able to re-read what it wrote).

- **It rides the handle**, already what `Editor.BlockData.getContributions()`
  gives the server — so the redaction consumer reads the registry it already
  reads, with no second registry to drift. Consumers filter generically
  (`audience === "human"`), never by type name, so a fifth annotation costs the
  delivery path zero edits.
- **Unmarked is unrepresentable here, not defaulted.** The old
  withheld-by-default rule is now a required field at the one site that knows the
  answer. Outside this family absent `audience` means ordinary content, visible
  to everyone — correct: a paragraph is withheld from nobody.
- **`./singularity check annotations:audience-declared`** fails a block type under
  this umbrella that reached for `defineContainerBlock` directly, which would make
  it an ordinary agent-visible container. Presence of `audience` is the
  discriminator; nothing else can set it.

**Read** by exactly one consumer:
[`plugins/agent-access`](plugins/agent-access/CLAUDE.md), which prunes `human`
subtrees out of the agent-facing `read_page` — and out of the WRITE's walk
through the same filter — and confines every write to the inside of an
`<agent-note>` card. That confinement is judged on the PLAN a write produces, not
on which id opened it: `edit_page` accepts any block, including the page itself.
`/private` is a real channel there and nowhere else — a `/prompt` launch still
sends only that block's own text, and no other surface filters.

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
`defineContainerBlock` directly — that is the audience declaration above, and the
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
  `TODO` and it becomes `▷ LAUNCH`, in place. See
  [`todo/plugins/task-link`](plugins/todo/plugins/task-link/CLAUDE.md).

`context` and `private-note` pass a bare name — plain and non-interactive on both
surfaces.

Per-block, and deliberately: its identity (`type`, label, aliases), its
tint, and its markdown marker. Those are four separate `Editor.Block` /
`Editor.BlockFrame` registrations rather than one parameterized helper, for the
reason `page/container` already records — containerhood is derived from *who
actually paints a box*, so a registration made on a plugin's behalf would move
that fact one indirection away from the plugin it describes.

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

The icons did not disappear — `MdRule`, `MdPendingActions`, `MdAutoAwesome` and
`MdVisibilityOff` still name their cards in the slash menu and the turn-into
list, off the handle. They just left the card, where they were charging every
instance a fixed price for a fact the tint already carries.

Within the family the hue carries the direction, over the shared semantic tokens
(never raw colors, so a preset switch restyles them for free):

- `context` — neutral `muted`: the background against which the agent works.
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

`/todo` is the one card that keeps its name at REST, and only once an agent is
running on it: the name then carries the task's live status (`RUNNING`, `DONE`),
which the tint cannot spell — an open card and a card with an agent working on it
are both `warning`. The rule is about what the name is SAYING, not about which
card it belongs to: hidden while it merely repeats the tint, shown while it
carries state the reader would otherwise have to open a popover to learn.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Umbrella for the page editor's annotation containers — the audience-scoped boxes that carry the human↔agent side-channel of a page: context, agent notes, private notes, TODO.
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
    - `page/annotations/context`
    - `page/annotations/private-notes`
    - `page/annotations/todo`
- Sub-plugins:
  - **`agent-access`** — The agent-facing tool surface over a page, as the file triple: read_page (human-audience subtrees pruned), write_agent_note (one card's contents) and edit_page (any block, judged by what the diff touched — every write must land inside an <agent-note> card). The policy over page/markdown-apply's audience-agnostic engine.
  - **`agent-notes`** — Agent-notes block type: a void CONTAINER whose soft-tinted box wraps blocks of any type nested inside it, holding what an agent wrote back to the page's author. Agent-notes block type: registers its (empty) `data` schema at the server write boundary, rejecting stray keys like an injected `text`.
  - **`context`** — Context block type: a void CONTAINER whose soft-tinted box wraps blocks of any type nested inside it, holding standing instructions addressed to agents rather than to the reader. Context block type: registers its (empty) `data` schema at the server write boundary, rejecting stray keys like an injected `text`.
  - **`private-notes`** — Private-note block type: a void CONTAINER whose soft-tinted box wraps blocks of any type nested inside it, holding notes withheld from agents. Private-note block type: registers its (empty) `data` schema at the server write boundary, rejecting stray keys like an injected `text`.
  - **`todo`** — TODO block type: a void CONTAINER whose soft-tinted box wraps blocks of any type nested inside it, marking a region of work agents still have to do. Also minted by typing `TODO ` at the start of a line. Its corner name and its rail menu open the dispatch panel, and the box and that name follow the dispatched task's live status. TODO block type: registers its (empty) `data` schema at the server write boundary, rejecting stray keys like an injected `text`.

<!-- AUTOGENERATED:END -->
