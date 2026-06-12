import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdSlideshow } from "react-icons/md";
import { Story } from "@plugins/apps/plugins/story/plugins/render/web";
import { SlidesRenderer } from "./components/slides-renderer";

export default {
  description: "Slides lens: each top-level block is a slide; top-level dividers split slides.",
  contributions: [
    // `match` is the dispatch key the host selects on (`key: activeRendererId`).
    // It equals `id` so the picker's id and the dispatch key stay in lockstep.
    Story.Renderer({
      match: "slides",
      id: "slides",
      label: "Slides",
      icon: MdSlideshow,
      component: SlidesRenderer,
    }),
  ],
} satisfies PluginDefinition;
