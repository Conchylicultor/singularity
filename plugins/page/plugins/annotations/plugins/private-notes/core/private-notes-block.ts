import { z } from "zod";
import { MdVisibilityOff } from "react-icons/md";
import { defineContainerBlock } from "@plugins/page/plugins/container/core";

/**
 * A private-note card is a VOID container: it owns NOTHING but its type.
 *
 * `z.object({})` — no `text` (its content is its children) and no appearance
 * fields. In particular NO `visibleTo` / `hidden` field: privacy is a fact of the
 * TYPE, not a per-instance toggle, so there is no state in which a card labelled
 * private is nonetheless shared. The write boundary parses through
 * `handle.schema.strict()`, so a stray key is a 400 rather than a quietly-stored
 * field.
 */
export const privateNotesDataSchema = z.object({});

/**
 * `defineContainerBlock` forces `anchor: true`, `collapsible: "never"` and
 * `wrapOnConvert: true` — see `@plugins/page/plugins/container/core` for why the
 * three are only correct together. This file declares nothing but identity.
 */
export const privateNotesBlock = defineContainerBlock({
  type: "private-notes",
  schema: privateNotesDataSchema,
  label: "Private note",
  icon: MdVisibilityOff,
  aliases: ["private", "hidden", "secret", "personal", "invisible", "draft"],
  empty: () => ({}),
  // One-way markdown for the EXTERNAL `text/plain` projection (internal
  // copy/paste is lossless through the `BLOCKS_MIME` JSON forest). A void
  // container has no text, so this emits the MARKER ALONE and the children carry
  // the content, indented two spaces under it by the central walk.
  //
  // The children ARE serialized here, and that is correct: this serializer runs
  // for the CLIPBOARD, and a human copying their own page must get their own
  // notes. Withholding the card from an AGENT is a different consumer, and it
  // must filter this family by audience rather than lean on a lossy serializer
  // (see `page/annotations/CLAUDE.md`) — a serializer that dropped its children
  // would silently eat the user's text on Cmd+C.
  markdown: { serialize: () => "**[Private]**" },
});
