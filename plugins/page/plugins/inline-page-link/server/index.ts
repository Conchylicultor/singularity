import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { PageLinks } from "@plugins/page/plugins/links/server";
import { Editor } from "@plugins/page/plugins/editor/server";
import { PAGE_LINK_TOKEN_PATTERN } from "../core";
import { extractInlinePageLinks } from "./internal/extract-inline-links";

export default {
  description:
    "Backlinks extractor for inline `[[<pageId>]]` page links embedded in any block's text.",
  contributions: [
    // Global extractor (no `type`): runs on every block so inline links in any
    // text-bearing block type feed the backlinks index without enumerating types.
    PageLinks.Extractor({ extract: extractInlinePageLinks }),
    // The same pattern the web extension deserializes with, so server-side
    // markdown serialization leaves `[[<pageId>]]` bytes alone.
    Editor.InlineToken({ pattern: PAGE_LINK_TOKEN_PATTERN }),
  ],
} satisfies ServerPluginDefinition;
