import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { bookmarkBlock } from "../core";
import { BookmarkBlock } from "./components/bookmark-block";

export { bookmarkBlock, BOOKMARK_TYPE } from "../core";

export default {
  description:
    "Bookmark block type: paste a link into an empty block to scrape OG metadata server-side and render a rich preview card (title, description, site, favicon, og:image cached same-origin).",
  contributions: [
    Editor.Block({
      match: bookmarkBlock.type,
      block: bookmarkBlock,
      component: BookmarkBlock,
    }),
  ],
} satisfies PluginDefinition;
