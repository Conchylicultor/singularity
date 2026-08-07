import { z } from "zod";
import { MdVisibilityOff } from "react-icons/md";
import { defineAnnotationBlock } from "@plugins/page/plugins/annotations/core";

/**
 * A private-note card is a VOID container: it owns NOTHING but its type.
 *
 * `z.object({})` — no `text` (its content is its children) and no appearance
 * fields. In particular NO `visibleTo` / `hidden` field: privacy is a fact of the
 * TYPE, not a per-instance toggle, so there is no state in which a card labelled
 * private is nonetheless shared. The write boundary parses through
 * `handle.schema.strict()`, so a stray key is a 400 rather than a quietly-stored
 * field.
 *
 * That claim used to be true only about the *absence* of a toggle — nothing read
 * the type either, so "private" was a label with no reader. The `audience`
 * declaration below is the other half: privacy is now a fact the TYPE states,
 * in the registry the server already resolves handles from.
 */
export const privateNotesDataSchema = z.object({});

/**
 * `defineAnnotationBlock` is `defineContainerBlock` plus a REQUIRED `audience`,
 * so this card cannot exist without saying who it is for. The container half
 * forces `anchor: true` and `wrapOnConvert: true` — see
 * `@plugins/page/plugins/container/core` for why the two are only correct
 * together. It declares no `collapsible`: a container folds to its BORROWED line
 * (its first child's), so its stored `expanded` is live. This file declares nothing but identity.
 */
/**
 * `privateNotesBlock.type === "private-note"` — singular for the same reason
 * `agent-note` is, and renamed WITH it so the family reads as one rule rather
 * than one renamed member and three exceptions. The symbol, directory and
 * package stay plural: they name a feature area, not an instance.
 */
export const privateNotesBlock = defineAnnotationBlock({
  type: "private-note",
  schema: privateNotesDataSchema,
  label: "Private note",
  icon: MdVisibilityOff,
  // The one card withheld from agents, and the reason `audience` exists at all.
  //
  // Declaring it here is what makes "privacy is a fact of the TYPE" a mechanism
  // rather than an aspiration: the agent-facing read path filters the family for
  // `audience === "human"` generically, so this card is withheld because of what
  // it IS, with no per-instance state to get wrong and no list of type names to
  // forget to update. What it does NOT do yet is redact — that consumer lands
  // with the agent-facing markdown tools; see `page/annotations/CLAUDE.md`.
  audience: "human",
  // `"private-notes"` is the former type, kept as a menu alias so the habit (and
  // the older docs) still find the card. Aliases are menu-search only — never a
  // markdown tag, never a stored value.
  aliases: ["private-notes", "private", "hidden", "secret", "personal", "invisible", "draft"],
  empty: () => ({}),
  // `<private-note>…</private-note>` — a real round-tripping syntax, replacing
  // the one-way `**[Private]**` marker.
  //
  // The children ARE serialized here, and that is correct: this serializer runs
  // for the CLIPBOARD, and a human copying their own page must get their own
  // notes. Withholding the card from an AGENT is a different consumer, and it
  // must filter this family by audience rather than lean on a lossy serializer
  // (see `page/annotations/CLAUDE.md`) — a serializer that dropped its children
  // would silently eat the user's text on Cmd+C.
  markdown: { tag: { body: "children" } },
});
