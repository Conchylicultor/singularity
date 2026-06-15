import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { linkPreviewEndpoint } from "../core";
import { handleLinkPreview } from "./internal/handle-link-preview";

export default {
  description:
    "Link-preview scraper for the bookmark block: fetches a URL (SSRF-guarded), extracts OG/Twitter metadata via HTMLRewriter, and caches og:image + favicon as same-origin attachments.",
  httpRoutes: {
    [linkPreviewEndpoint.route]: handleLinkPreview,
  },
} satisfies ServerPluginDefinition;
