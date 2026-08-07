import { z } from "zod";
import { MdAutoAwesome } from "react-icons/md";
import { defineAnnotationBlock } from "@plugins/page/plugins/annotations/core";

/**
 * An agent-note card is a VOID container: it owns NOTHING but its type.
 *
 * `z.object({})` — no `text` (its content is its children) and no appearance
 * fields (one fixed look, so there is nothing per-instance to store). The write
 * boundary parses through `handle.schema.strict()`, so a stray key is a 400
 * rather than a quietly-stored field.
 *
 * Deliberately NOT a payload field: *which* agent / run wrote the card. That is
 * provenance — it has to survive edits, be queryable, and accumulate SEVERAL
 * authors — so it lives in the `authorship` sub-plugin's block-keyed link table.
 * A name in this block's `data` would be a single-valued, unjoinable copy of it.
 */
export const agentNotesDataSchema = z.object({});

/**
 * `defineAnnotationBlock` is `defineContainerBlock` plus a REQUIRED `audience`,
 * so this card cannot exist without saying who it is for. The container half
 * forces `anchor: true` and `wrapOnConvert: true` — see
 * `@plugins/page/plugins/container/core` for why the two are only correct
 * together. It declares no `collapsible`: a container folds to its BORROWED line
 * (its first child's), so its stored `expanded` is live. This file declares nothing but identity.
 */
/**
 * `agentNotesBlock.type === "agent-note"`, and the mismatch is deliberate. The
 * TYPE is an instance — one card, singular — and it is also the markdown tag an
 * agent reads and writes (`<agent-note id="…">`), where the plural read as a
 * container of several notes. The SYMBOL, the directory, the package and the
 * `agent-notes-authors` resource name a feature AREA, not an instance, and stay
 * plural: renaming them is all cost and no meaning. See
 * `research/2026-08-07-page-agent-note-file-like-tools.md` §1.
 */
export const agentNotesBlock = defineAnnotationBlock({
  type: "agent-note",
  schema: agentNotesDataSchema,
  label: "Agent notes",
  icon: MdAutoAwesome,
  // `"agent"` even though the card is addressed TO the human: `audience` answers
  // "may an agent receive this", not "who is the reader". An agent must be able
  // to re-read what it wrote last time — and it is the one card an agent may
  // WRITE, which would be incoherent if it could not also see it.
  audience: "agent",
  // `"agent-notes"` is here because it WAS the type: the slash menu matched it
  // for as long as the card has existed, so dropping it would silently break a
  // habit (and every doc that spells the card plural). An alias is menu-search
  // only — it is not a markdown tag and not a stored value — so this costs the
  // rename nothing.
  aliases: ["agent-notes", "agent", "agents", "ai", "notes", "findings", "report"],
  empty: () => ({}),
  // `<agent-note id="…">…</agent-note>` — a real round-tripping syntax,
  // replacing the one-way `**[Agent notes]**` marker. What the marker was for is
  // unchanged (a reader of the page's markdown can tell these lines were written
  // BY an agent rather than by the page's author), and the card now survives the
  // round trip instead of dissolving into its contents. Still no prefix claim: a
  // tag is explicit, so it can never convert real prose on paste.
  //
  // `identified` is what makes the card ADDRESSABLE, and this is the one block
  // type that needs to be: it is the only thing an agent may write to, so an
  // agent reading a page has to come back with "the card you showed me as
  // `block-…`", not with a paragraph the applier has to recognize by its words.
  // The attribute is the row it addresses (`SerializedBlock.ref`), never part of
  // this card's `data` — which is still, and stays, `z.object({})`. On the
  // CLIPBOARD there is no row id to emit, so a copied card serializes bare and
  // pasting it mints a fresh one, exactly as before.
  markdown: { tag: { body: "children", identified: true } },
});
