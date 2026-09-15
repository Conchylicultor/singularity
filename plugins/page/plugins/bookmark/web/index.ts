import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { bookmarkBlock } from "../core";
import { BookmarkBlock } from "./components/bookmark-block";

export { bookmarkBlock, BOOKMARK_TYPE } from "../core";

export default {
  description:
    "Bookmark block type: a link pasted into an empty block can become one (via the pasted-link menu), scraping OG metadata server-side to render a rich preview card (title, description, site, favicon, og:image cached same-origin).",
  contributions: [
    Editor.Block({
      id: bookmarkBlock.type,
      match: bookmarkBlock.type,
      block: bookmarkBlock,
      component: BookmarkBlock,
      caret: "editor",
    }),
  ],
} satisfies PluginDefinition;
