import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { PageLinks } from "@plugins/page/plugins/links/server";
import { Editor } from "@plugins/page/plugins/editor/server";
import { PAGE_LINK_TOKEN_PATTERN, pageLinkInlineNode } from "../core";
import { extractInlinePageLinks } from "./internal/extract-inline-links";

export default {
  description:
    "Backlinks extractor for inline `[[page:<pageId>]]` page links embedded in any block's text.",
  contributions: [
    // Global extractor (no `type`): runs on every block so inline links in any
    // text-bearing block type feed the backlinks index without enumerating types.
    PageLinks.Extractor({ extract: extractInlinePageLinks }),
    // The same pattern the web extension deserializes with, so server-side
    // markdown serialization leaves `[[page:<pageId>]]` bytes alone. One
    // RegExp, and its alternation already covers the pre-namespace form — the
    // slot takes a pattern, never a capture group, so nothing here branches.
    //
    // `node` is the SAME spec object `web/components/page-link-inline-node.tsx`
    // decorates, so a block holding a materialized page link stays readable and
    // editable from the server instead of refusing every `edit_page`.
    Editor.InlineToken({
      pattern: PAGE_LINK_TOKEN_PATTERN,
      // `[[page:<id>]]` is made of brackets, which the inline scan reads as a
      // markdown link — so it genuinely needs masking. `markdownSpan` is a
      // separate field from `pattern` because most tokens do NOT.
      markdownSpan: "protect",
      node: pageLinkInlineNode,
    }),
  ],
} satisfies ServerPluginDefinition;
