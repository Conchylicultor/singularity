import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Editor } from "@plugins/page/plugins/editor/server";
import { bookmarkBlock, linkMetaEndpoint, linkPreviewEndpoint } from "../core";
import { handleLinkMeta } from "./internal/handle-link-meta";
import { handleLinkPreview } from "./internal/handle-link-preview";

export default {
  description:
    "Link-preview scraper for the bookmark block: fetches a URL (SSRF-guarded), extracts OG/Twitter metadata via HTMLRewriter, and caches og:image + favicon as same-origin attachments. Also serves a title-only lookup (/api/link-meta, no image downloads) for the pasted-link Mention, and registers the bookmark `data` schema at the server write boundary.",
  httpRoutes: {
    [linkPreviewEndpoint.route]: handleLinkPreview,
    [linkMetaEndpoint.route]: handleLinkMeta,
  },
  contributions: [Editor.BlockData(bookmarkBlock)],
} satisfies ServerPluginDefinition;
