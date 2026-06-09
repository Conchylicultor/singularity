import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { storiesResource } from "./internal/resource";
import { handleSetStoryMark, handleClearStoryMark } from "./internal/routes";
import { setStoryMark, clearStoryMark } from "../shared/endpoints";

export { storyMark } from "./internal/tables";
export { getStoryMark, setStoryMark } from "./internal/mutations";
export { storiesResource } from "./internal/resource";

export default {
  description:
    "Story capability marker: page_blocks_ext_story side-table (entity-extensions), storiesResource, set/clear endpoints, useIsStory/useStories.",
  contributions: [Resource.Declare(storiesResource)],
  httpRoutes: {
    [setStoryMark.route]: handleSetStoryMark,
    [clearStoryMark.route]: handleClearStoryMark,
  },
} satisfies ServerPluginDefinition;
