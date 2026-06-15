import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { quoteBlock } from "../core";
import { QuoteBlock } from "./components/quote-block";

export { quoteBlock } from "../core";

export default {
  description: "Quote / blockquote block type for the page editor.",
  contributions: [
    Editor.Block({ match: quoteBlock.type, block: quoteBlock, component: QuoteBlock }),
  ],
} satisfies PluginDefinition;
