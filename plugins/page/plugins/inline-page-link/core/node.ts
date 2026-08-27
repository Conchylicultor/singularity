import { defineInlineTokenNode } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/plugins/node/core";
import { PAGE_LINK_TOKEN_PATTERN, pageLinkToken } from "./tokens";

/**
 * The inline page-link token family's ONE declaration — type string, field
 * names, token format, and how a {@link PAGE_LINK_TOKEN_PATTERN} match reads
 * back. Lives in `core/` so the browser's rendering subclass and any headless
 * reader are the same family by construction, not by two literals agreeing.
 *
 * A `type` alias, never an `interface`: TypeScript grants an implicit index
 * signature to the former only, and without it this does not satisfy the
 * `F extends TokenFields` constraint — `defineInlineTokenNode` rejects it.
 */
export type PageLinkFields = { pageId: string };

/**
 * `textContent: "empty"` is a decision, not an omission: the token must NOT
 * leak into live root-text reads — the slash menu and the `[[` query both scan
 * the editor root's text — so serialization happens only through the
 * extension's derived serializer.
 */
export const pageLinkInlineNode = defineInlineTokenNode<PageLinkFields>({
  type: "page-link-inline",
  fields: ["pageId"],
  token: (fields) => pageLinkToken(fields.pageId),
  // Group 1 = the namespaced form; group 2 = the pre-namespace one (read-only
  // compatibility — nothing mints it any more). Exactly one matches per token.
  fieldsOf: (match) => ({ pageId: match[1] ?? match[2]! }),
  textContent: "empty",
});
