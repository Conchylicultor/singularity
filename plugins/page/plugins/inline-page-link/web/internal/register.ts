import { registerBlockTextExtension } from "@plugins/page/plugins/editor/web";
import { PAGE_LINK_TOKEN_PATTERN, pageLinkToken } from "../../core";
import {
  $createPageLinkInlineNode,
  $isPageLinkInlineNode,
  PageLinkInlineNode,
} from "../components/page-link-inline-node";
import { InlinePageLinkPlugin } from "../components/inline-page-link-plugin";

// Side-effect: teach every block text editor about inline page links — the node,
// how to (de)serialize its `[[page:<pageId>]]` token (one pattern whose second
// arm reads the pre-namespace form, branched by capture group), and the `[[`
// typeahead plugin.
registerBlockTextExtension({
  id: "page-link-inline",
  node: PageLinkInlineNode,
  deserializePattern: PAGE_LINK_TOKEN_PATTERN,
  createNodeFromMatch: (m) => $createPageLinkInlineNode(m[1] ?? m[2]!),
  serializeNode: (n) =>
    $isPageLinkInlineNode(n) ? pageLinkToken(n.getPageId()) : null,
  Plugin: InlinePageLinkPlugin,
});
