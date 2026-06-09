import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useIsStory, useStories } from "./hooks";
export { markStory, unmarkStory } from "./internal/api";
export type { StoryMark } from "../shared/schemas";

export default {
  description:
    "Story capability marker (read hooks + set/clear mutations). No UI: useIsStory/useStories, markStory/unmarkStory.",
  contributions: [],
} satisfies PluginDefinition;
