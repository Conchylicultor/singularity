import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MarkdownEnhancerSlot } from "@plugins/primitives/plugins/markdown/web";
import { FileLinksEnhancer } from "./internal/file-links-enhancer";
import { CodeEnhancer } from "./internal/code-enhancer";
import { ImgEnhancer } from "./internal/img-enhancer";

export default {
  id: "markdown-extensions",
  name: "Markdown Extensions",
  description:
    "Conversation-scoped markdown enhancers: file-links, inline code enhancements, and image proxying.",
  contributions: [
    MarkdownEnhancerSlot({
      id: "file-links",
      order: 10,
      Component: FileLinksEnhancer,
    }),
    MarkdownEnhancerSlot({
      id: "code-inline",
      order: 20,
      Component: CodeEnhancer,
    }),
    MarkdownEnhancerSlot({
      id: "img-proxy",
      order: 30,
      Component: ImgEnhancer,
    }),
  ],
} satisfies PluginDefinition;
