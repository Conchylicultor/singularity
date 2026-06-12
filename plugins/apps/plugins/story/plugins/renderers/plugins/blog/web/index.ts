import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdArticle } from "react-icons/md";
import { Story } from "@plugins/apps/plugins/story/plugins/render/web";
import { BlogRenderer } from "./components/blog-renderer";

export default {
  description: "Blog lens: AI-generated continuous article from the outline.",
  contributions: [
    // `match` is the dispatch key the host selects on (`key: activeRendererId`).
    // It equals `id` so the picker's id and the dispatch key stay in lockstep.
    Story.Renderer({
      match: "blog",
      id: "blog",
      label: "Blog",
      icon: MdArticle,
      component: BlogRenderer,
    }),
  ],
} satisfies PluginDefinition;
