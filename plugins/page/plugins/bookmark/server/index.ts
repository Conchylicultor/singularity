import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Editor } from "@plugins/page/plugins/editor/server";
import { bookmarkBlock, linkPreviewEndpoint } from "../core";
import { handleLinkPreview } from "./internal/handle-link-preview";

export default {
  description:
    "Link-preview scraper for the bookmark block: fetches a URL (SSRF-guarded), extracts OG/Twitter metadata via HTMLRewriter, and caches og:image + favicon as same-origin attachments. Also registers the bookmark `data` schema at the server write boundary.",
  httpRoutes: {
    [linkPreviewEndpoint.route]: handleLinkPreview,
  },
  contributions: [Editor.BlockData(bookmarkBlock)],
} satisfies ServerPluginDefinition;
