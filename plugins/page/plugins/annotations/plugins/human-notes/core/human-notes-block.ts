import { z } from "zod";
import { MdPerson } from "react-icons/md";
import { defineAnnotationBlock } from "@plugins/page/plugins/annotations/core";

/**
 * A human card is a VOID container: it owns NOTHING but its type.
 *
 * `z.object({})` — no `text` (its content is its children) and no appearance
 * fields (the card has one fixed look, so there is nothing per-instance to
 * store); `divider` is the precedent for an empty payload. The write boundary
 * parses through `handle.schema.strict()`, so a stray `text` key is REJECTED
 * with a 400 rather than quietly stored — which is what makes the void model
 * enforced instead of aspirational, and what stops the previous
 * text-bearing-card rows from being written back.
 */
export const humanNotesDataSchema = z.object({});

/**
 * `defineAnnotationBlock` is `defineContainerBlock` plus the REQUIRED `audience`
 * and `author`, so this card cannot exist without saying who may receive it and
 * whose words it holds.
 *
 * It forces `anchor: true` and `wrapOnConvert: true` — the
 * two facts that are only correct together. The
 * consequences, all of which the previous text-bearing model got wrong:
 *
 * - the card renders no line, so its FIRST VISIBLE LINE can be a heading (or a
 *   to-do, an image, a code block) — converting a child can never touch the
 *   container;
 * - Enter in a child is a plain sibling split inside the box, never a second
 *   human card;
 * - `/human` on an existing block WRAPS it, keeping the origin's id (and with
 *   it the caret, its content `Y.Doc` and its undo history).
 *
 * The card still FOLDS, and needed no header row to do it: a container collapses
 * to its BORROWED line (its first child's — the one the anchor already borrows
 * to seat its glyph), so the chevron rides on that line's row. Which is why this
 * declares no `collapsible`: its stored `expanded` is live.
 */
/**
 * `humanNotesBlock.type === "context"`, and the mismatch is deliberate — the
 * same type-vs-symbol split `agent-note` records, arrived at from the other
 * direction: there the SYMBOL kept the old spelling, here the TYPE does.
 *
 * The card was `/context` until the family started declaring `author`, at which
 * point the load-bearing fact about it stopped being *what it holds* and became
 * *whose words they are* — so the directory, the symbol, the label, the corner
 * chip and the markdown tag all say `human`. The stored value did not follow,
 * for three reasons that are each sufficient on their own:
 *
 * - **`BlockTag.name` exists precisely so a tag may differ from a type**, so
 *   `<human>` costs the rename nothing;
 * - **the type is what prod page rows store**, so renaming it is a data
 *   migration over every page anybody has ever written a context card on —
 *   paid for a string nobody reads;
 * - **the `Editor.Block` contribution id IS the type**, and `reorder`'s per-slot
 *   directives are keyed by `<pluginId>:<contributionId>`. The directory move
 *   already changes the first half, which is why `config/page/editor/block.jsonc`
 *   had to be repointed by hand for the card to stay in the palette's
 *   Annotations group; moving the second half too would have been a second
 *   silent orphan, in a file nobody thinks to check when they rename a folder.
 *
 * `context` and `user` survive as `/` aliases, so nobody has to learn the
 * change to keep inserting the card.
 */
export const humanNotesBlock = defineAnnotationBlock({
  type: "context",
  schema: humanNotesDataSchema,
  label: "Human",
  icon: MdPerson,
  // The card exists to be READ by an agent — withholding it would defeat the
  // block: an agent that never receives the page's conventions is exactly the
  // state this card was added to fix.
  audience: "agent",
  // The page author's own words, and therefore NOT the agent's to rewrite. This
  // is the whole point of the rename: `audience` already said an agent may see
  // the card, and nothing said it may not touch it, so a `/human` card nested
  // inside an `<agent-note>` was rewritable by the next `write_agent_note`.
  // `author: "human"` closes that hole generically — the write walk stops at the
  // nearest row that declares anything, and this row declares CLOSED.
  author: "human",
  // `"context"` and `"user"` are the words this card answered to before, kept so
  // the habit (and every doc that spells it `/context`) still finds it. Aliases
  // are menu-search only — never a markdown tag, never a stored value — so
  // carrying the old spellings costs the rename nothing.
  //
  // NOT "agent" / "agents" / "ai": those belong to the sibling `/agent` block
  // (notes an agent wrote back). This card is what a human tells an agent, so its
  // remaining aliases are the instruction words — otherwise `/agent` would
  // surface two opposite-direction cards with no way to tell which is which.
  aliases: [
    "context",
    "user",
    "me",
    "mine",
    "instructions",
    "guidance",
    "conventions",
    "rules",
  ],
  empty: () => ({}),
  // `<human>…</human>` — a real round-tripping syntax, replacing the one-way
  // `**[Agent context]**` marker. The point of the marker survives (an agent
  // reading a page's markdown can still tell these lines are addressed to it,
  // and the children's indentation is anchored rather than dangling) and the
  // card now comes BACK as a card instead of dissolving into its contents.
  // Still no prefix claim: a tag is explicit, so it can never convert real prose
  // on paste the way a `parseLine` prefix would.
  //
  // The `name` is what makes the tag `<human>` while the stored type stays
  // `context` — see the note above. Beside `<agent-note>` it also reads as the
  // opposition it is: an agent looking at a page can tell at a glance which
  // lines are its own and which are the author's.
  //
  // `identified` carries the card's own ROW id as the reserved `id` attribute,
  // the same way `<agent-note>` and `<todo>` do, and for the sharper reason: an
  // agent rewriting a card that CONTAINS one of these must reproduce it
  // exactly, so the applier has to pin the row by id rather than infer its
  // identity from the content — which for a void card is `type ␀ {}`,
  // byte-identical for every human card on the page. Omitting the card plans a
  // delete, which the write policy refuses; the id is what makes echoing it back
  // an exact, checkable act rather than a guess by the aligner.
  //
  // The attribute is the row it addresses (`SerializedBlock.ref`), never part of
  // this card's `data` — which is still, and stays, `z.object({})`. On the
  // CLIPBOARD there is no row id to emit, so a copied card serializes bare and
  // pasting it mints a fresh one (an id-less forest omits the attribute and is
  // not an error — see `BlockTag.identified`).
  markdown: { tag: { name: "human", body: "children", identified: true } },
});
