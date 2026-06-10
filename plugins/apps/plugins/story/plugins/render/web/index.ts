import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Story } from "./slots";
export { StoryRender } from "./components/story-render";
export { RendererPicker } from "./components/renderer-picker";

export default {
  description:
    "Owns the Story.Renderer + Story.Content dispatch slots, the <StoryRender pageId rendererId/> surface, RendererPicker, and visible unsupported-block / no-renderer fallbacks.",
  contributions: [], // inert: no contributors land in this task
} satisfies PluginDefinition;
