import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { PageLinks } from "@plugins/page/plugins/links/server";
import { extractInlinePageLinks } from "./internal/extract-inline-links";

export default {
  description:
    "Backlinks extractor for inline `[[<pageId>]]` page links embedded in any block's text.",
  contributions: [
    // Global extractor (no `type`): runs on every block so inline links in any
    // text-bearing block type feed the backlinks index without enumerating types.
    PageLinks.Extractor({ extract: extractInlinePageLinks }),
  ],
} satisfies ServerPluginDefinition;
