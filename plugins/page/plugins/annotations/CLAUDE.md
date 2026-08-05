# annotations

The page's **side-channel between a human and the agents working on it**, as
block types. An annotation is a [void container](../container/CLAUDE.md) — it owns
no text; its content IS its children — whose dashed box says *this run of blocks
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
subtrees out of the agent-facing `read_page` and refuses to write anywhere but an
`<agent-notes>` card. `/private` is a real channel there and nowhere else — a
`/prompt` launch still sends only that block's own text, and no other surface
filters.

**The markdown serializer keeps emitting private children**, deliberately: it
runs for the CLIPBOARD, and a human copying their own page must get their own
notes. Redaction is the agent-facing consumer's job, never a serializer's, which
would silently eat text on Cmd+C.

## What every annotation shares, and what stays per-block

Shared, and NOT re-derived per plugin: the whole void-container shape —
`anchor` / `wrapOnConvert` forced, plus `ContainerNoRow`, `ContainerBackdrop` and
`ContainerAnchor`. The mechanism lives in
[`page/container`](../container/CLAUDE.md); an annotation plugin adds none of its
own. It reaches it through this umbrella's `defineAnnotationBlock`, never
`defineContainerBlock` directly — that is the audience declaration above, and the
check enforces it.

**None of the four has per-instance appearance** (every payload is `z.object({})`),
so none contributes a `BlockFrameMeta.menu`: Collapse / Remove `<label>` / Delete
come from the rail on the line the card BORROWS, whose menu arm keys on the core
`BlockHandle.anchor` fact rather than on a contributed menu.

Three pass `ContainerAnchor` a bare `glyph` — a plain, non-interactive mark on both
surfaces. **`agent-notes` also passes `sections`**, and that does not break the rule
above: its `data` is still `z.object({})`. What the popover shows is PROVENANCE
(which conversations wrote the card), held in a side-table keyed on the block id —
per-instance state that is not per-instance *data*. See
[`agent-notes/plugins/authorship`](plugins/agent-notes/plugins/authorship/CLAUDE.md).
With no authors the card renders the plain inert mark.

Per-block, and deliberately: its identity (`type`, label, aliases, glyph), its
tint, and its markdown marker. Those are four separate `Editor.Block` /
`Editor.BlockFrame` registrations rather than one parameterized helper, for the
reason `page/container` already records — containerhood is derived from *who
actually paints a box*, so a registration made on a plugin's behalf would move
that fact one indirection away from the plugin it describes.

### The tints are one visual language

All four are **dashed** — the family signature, and what separates them at a
glance from `page/callout`'s solid tint, which is prose the reader should notice.
Within the family the hue carries the direction, over the shared semantic tokens
(never raw colors, so a preset switch restyles them for free):

- `context` — neutral `muted`: the background against which the agent works.
- `agent-notes` — `info`: something an agent is telling you.
- `todo` — `warning`: outstanding work.
- `private-notes` — `destructive` at low alpha: restricted, not an error. The
  glyph (a struck-through eye) carries the meaning; the tint only flags it.

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
  - **`agent-access`** — The agent-facing tool surface over a page: read_page (human-audience subtrees pruned) plus append/write/edit_agent_notes, which can address nothing but an <agent-notes> card. The policy over page/markdown-apply's audience-agnostic engine.
  - **`agent-notes`** — Agent-notes block type: a void CONTAINER whose dashed box wraps blocks of any type nested inside it, holding what an agent wrote back to the page's author. Agent-notes block type: registers its (empty) `data` schema at the server write boundary, rejecting stray keys like an injected `text`.
  - **`context`** — Context block type: a void CONTAINER whose dashed box wraps blocks of any type nested inside it, holding standing instructions addressed to agents rather than to the reader. Context block type: registers its (empty) `data` schema at the server write boundary, rejecting stray keys like an injected `text`.
  - **`private-notes`** — Private-note block type: a void CONTAINER whose dashed box wraps blocks of any type nested inside it, holding notes withheld from agents. Private-note block type: registers its (empty) `data` schema at the server write boundary, rejecting stray keys like an injected `text`.
  - **`todo`** — TODO block type: a void CONTAINER whose dashed box wraps blocks of any type nested inside it, marking a region of work agents still have to do. Also minted by typing `TODO ` at the start of a line. TODO block type: registers its (empty) `data` schema at the server write boundary, rejecting stray keys like an injected `text`.

<!-- AUTOGENERATED:END -->
